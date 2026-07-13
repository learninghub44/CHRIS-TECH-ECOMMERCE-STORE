import axios, { AxiosInstance } from "axios"

export type MpesaOptions = {
  consumerKey: string
  consumerSecret: string
  shortcode: string // Paybill or Till number
  passkey: string // Lipa Na M-Pesa Online passkey
  callbackUrl: string // Publicly reachable URL for Safaricom to POST results to
  environment: "sandbox" | "production"
  transactionType?: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline"
}

type StkPushParams = {
  phone: string // MSISDN, e.g. 2547XXXXXXXX
  amount: number // whole KES, Daraja does not accept decimals
  accountReference: string // e.g. order/cart id, max 12 chars
  transactionDesc: string
}

type StkPushResponse = {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

type StkQueryResponse = {
  ResponseCode: string
  ResponseDescription: string
  MerchantRequestID: string
  CheckoutRequestID: string
  ResultCode: string
  ResultDesc: string
}

const BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
}

/**
 * Thin wrapper around Safaricom's Daraja API (STK Push / Lipa Na M-Pesa Online).
 * Handles OAuth token caching, timestamp/password generation, STK push, and status query.
 */
export class DarajaClient {
  private http: AxiosInstance
  private options: MpesaOptions
  private token: string | null = null
  private tokenExpiresAt = 0

  constructor(options: MpesaOptions) {
    this.options = options
    this.http = axios.create({ baseURL: BASE_URLS[options.environment] })
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token
    }

    const auth = Buffer.from(
      `${this.options.consumerKey}:${this.options.consumerSecret}`
    ).toString("base64")

    const { data } = await this.http.get(
      "/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    )

    this.token = data.access_token
    // Daraja tokens are valid ~1hr; refresh a minute early to be safe
    this.tokenExpiresAt = Date.now() + (Number(data.expires_in ?? 3599) - 60) * 1000
    return this.token as string
  }

  private timestamp(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    return (
      d.getFullYear().toString() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    )
  }

  private password(timestamp: string): string {
    return Buffer.from(
      `${this.options.shortcode}${this.options.passkey}${timestamp}`
    ).toString("base64")
  }

  /** Normalizes local (07..) or +254 numbers to Daraja's expected 2547XXXXXXXX format. */
  static normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "")
    if (digits.startsWith("254")) return digits
    if (digits.startsWith("0")) return `254${digits.slice(1)}`
    if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`
    return digits
  }

  async stkPush(params: StkPushParams): Promise<StkPushResponse> {
    const token = await this.getToken()
    const timestamp = this.timestamp()
    const phone = DarajaClient.normalizePhone(params.phone)

    const { data } = await this.http.post<StkPushResponse>(
      "/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: this.options.shortcode,
        Password: this.password(timestamp),
        Timestamp: timestamp,
        TransactionType:
          this.options.transactionType ?? "CustomerPayBillOnline",
        Amount: Math.round(params.amount),
        PartyA: phone,
        PartyB: this.options.shortcode,
        PhoneNumber: phone,
        CallBackURL: this.options.callbackUrl,
        AccountReference: params.accountReference.slice(0, 12),
        TransactionDesc: params.transactionDesc.slice(0, 13),
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    return data
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResponse> {
    const token = await this.getToken()
    const timestamp = this.timestamp()

    const { data } = await this.http.post<StkQueryResponse>(
      "/mpesa/stkpushquery/v1/query",
      {
        BusinessShortCode: this.options.shortcode,
        Password: this.password(timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    return data
  }
}
