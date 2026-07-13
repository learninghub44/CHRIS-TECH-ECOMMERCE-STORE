# medusa-payment-mpesa

M-Pesa (Safaricom Daraja / Lipa Na M-Pesa Online STK Push) payment provider
for Medusa v2.

## How it works

1. Customer picks "M-Pesa" at checkout and confirms with their phone number.
2. `initiatePayment` fires an STK push — the customer gets a PIN prompt on
   their phone. Medusa's payment session stays `pending`.
3. Safaricom POSTs the result to `https://YOUR_BACKEND_URL/hooks/payment/mpesa`
   (Medusa's built-in generic payment webhook route — no extra route needed).
4. `getWebhookActionAndData` reads the callback, returns `captured` or
   `failed`, and Medusa completes the cart into an order automatically on
   success.

As a fallback (e.g. local dev without a public callback URL), `authorizePayment`
and `getPaymentStatus` poll Daraja's STK query endpoint directly.

## Install

Copy `src/providers/mpesa` into your Medusa backend, e.g.:

```
your-medusa-backend/
  src/
    modules/
      mpesa/
        index.ts
        service.ts
        client.ts
```

Install the one dependency:

```bash
npm install axios
```

## Configure

Get your Consumer Key/Secret and Passkey from https://developer.safaricom.co.ke
(sandbox first, then apply for a production Paybill/Till).

In `medusa-config.ts`:

```ts
module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/mpesa",
            id: "mpesa",
            options: {
              consumerKey: process.env.MPESA_CONSUMER_KEY,
              consumerSecret: process.env.MPESA_CONSUMER_SECRET,
              shortcode: process.env.MPESA_SHORTCODE,
              passkey: process.env.MPESA_PASSKEY,
              callbackUrl: process.env.MPESA_CALLBACK_URL, // e.g. https://api.yourstore.co.ke/hooks/payment/mpesa
              environment: process.env.MPESA_ENV, // "sandbox" | "production"
            },
          },
        ],
      },
    },
  ],
})
```

`.env`:

```
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=https://api.yourstore.co.ke/hooks/payment/mpesa
MPESA_ENV=sandbox
```

Then enable `mpesa` as a payment provider on your Kenya region in the admin
dashboard (Settings → Regions → Kenya → Payment providers), or via the API.

## Passing the phone number

The storefront needs to send the customer's phone number as `extra_data` when
creating the payment session, since Daraja needs a phone number to push to:

```ts
await sdk.store.payment.initiatePaymentSession(cart, {
  provider_id: "pp_mpesa_mpesa",
  data: {
    extra_data: { phone: "0712345678" },
  },
})
```

## Known limitations

- **Refunds**: Daraja STK Push has no refund API. Reversals go through a
  separate B2C product that needs its own credentials — `refundPayment`
  throws on purpose rather than silently no-op-ing.
- **Amounts**: Daraja only accepts whole KES (no cents) — amounts are rounded.
- **Local dev**: Safaricom can't reach `localhost`. Use ngrok (or similar) and
  point `MPESA_CALLBACK_URL` at the tunnel while testing sandbox pushes.
