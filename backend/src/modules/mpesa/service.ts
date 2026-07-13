import { AbstractPaymentProvider, MedusaError } from "@medusajs/framework/utils"
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { DarajaClient, MpesaOptions } from "./client"

type InjectedDependencies = {
  logger: Logger
}

/**
 * M-Pesa (Safaricom Daraja / Lipa Na M-Pesa Online STK Push) payment provider for Medusa v2.
 *
 * Flow:
 * 1. initiatePayment  -> fires the STK push, customer gets a prompt on their phone
 * 2. Customer enters their M-Pesa PIN on their phone (outside Medusa entirely)
 * 3a. Safaricom POSTs the result to your callback URL -> getWebhookActionAndData resolves it, or
 * 3b. If you're not exposing a public webhook yet, authorizePayment/getPaymentStatus poll Daraja directly
 */
class MpesaProviderService extends AbstractPaymentProvider<MpesaOptions> {
  static identifier = "mpesa"

  protected logger_: Logger
  protected client: DarajaClient

  constructor(container: InjectedDependencies, options: MpesaOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.client = new DarajaClient(options)
  }

  static validateOptions(options: Record<string, any>): void | never {
    const required = [
      "consumerKey",
      "consumerSecret",
      "shortcode",
      "passkey",
      "callbackUrl",
      "environment",
    ]
    for (const key of required) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `M-Pesa provider: "${key}" is required in medusa-config.ts options.`
        )
      }
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, context } = input
    const phone =
      (context?.extra_data as Record<string, any>)?.phone ??
      (context?.customer as Record<string, any>)?.phone

    if (!phone) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "M-Pesa payment requires a phone number. Pass it as `phone` in the payment session's extra_data."
      )
    }

    const reference =
      (context?.resource_id as string) ?? `ord_${Date.now()}`

    try {
      const res = await this.client.stkPush({
        phone,
        amount: Number(amount),
        accountReference: reference,
        transactionDesc: "Order payment",
      })

      // Not authorized yet — customer still needs to enter their PIN.
      // Medusa keeps this payment session pending until the webhook (or a
      // status poll) reports success.
      return {
        id: res.CheckoutRequestID,
        data: {
          merchant_request_id: res.MerchantRequestID,
          checkout_request_id: res.CheckoutRequestID,
          response_description: res.ResponseDescription,
          customer_message: res.CustomerMessage,
          phone,
        },
      }
    } catch (err: any) {
      this.logger_.error(`M-Pesa STK push failed: ${err?.message}`)
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        err?.response?.data?.errorMessage ?? "Failed to initiate M-Pesa STK push."
      )
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const checkoutRequestId = (input.data as Record<string, any>)
      ?.checkout_request_id

    if (!checkoutRequestId) {
      return { data: input.data, status: "pending" }
    }

    try {
      const status = await this.client.stkQuery(checkoutRequestId)

      if (status.ResultCode === "0") {
        return {
          data: { ...input.data, ...status },
          status: "authorized",
        }
      }

      // 1032 = cancelled by user, 1037 = timeout, anything else = failed
      if (["1032", "1037"].includes(status.ResultCode)) {
        return { data: { ...input.data, ...status }, status: "canceled" }
      }

      return { data: { ...input.data, ...status }, status: "pending_authorization" }
    } catch {
      // Query can 500 while the push is still awaiting PIN entry — treat as pending.
      return { data: input.data, status: "pending_authorization" }
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const checkoutRequestId = (input.data as Record<string, any>)
      ?.checkout_request_id

    if (!checkoutRequestId) {
      return { status: "pending" }
    }

    try {
      const status = await this.client.stkQuery(checkoutRequestId)
      if (status.ResultCode === "0") return { status: "captured", data: status }
      if (["1032", "1037"].includes(status.ResultCode))
        return { status: "canceled", data: status }
      return { status: "pending" }
    } catch {
      return { status: "pending" }
    }
  }

  // M-Pesa STK push settles immediately once confirmed — there's no separate
  // capture step like card auth-then-capture, so this is a no-op that returns
  // the existing data.
  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return { data: input.data }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    return { data: input.data }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  // M-Pesa doesn't support programmatic refunds via Daraja B2C without
  // separate B2C credentials/setup — flag it clearly rather than silently
  // no-op-ing money back to a customer.
  async refundPayment(
    _input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "M-Pesa refunds require Daraja B2C setup and must be issued manually or via a separate B2C integration."
    )
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data } = payload
    const callback = (data as any)?.Body?.stkCallback

    if (!callback) {
      return { action: "not_supported" }
    }

    const checkoutRequestId = callback.CheckoutRequestID

    if (callback.ResultCode !== 0) {
      // 1032 = cancelled by user, otherwise failed
      return {
        action: "failed",
        data: { session_id: checkoutRequestId, amount: 0 as any },
      }
    }

    const items: Array<{ Name: string; Value: any }> =
      callback.CallbackMetadata?.Item ?? []
    const get = (name: string) =>
      items.find((i) => i.Name === name)?.Value

    return {
      action: "captured",
      data: {
        session_id: checkoutRequestId,
        amount: get("Amount"),
      },
    }
  }
}

export default MpesaProviderService
