# Chris Tech Ecommerce Store

Open-source ecommerce base for Kenya, built on [Medusa](https://medusajs.com) (Node.js/Next.js).

## Structure

- `storefront/` — Next.js storefront (from `medusajs/nextjs-starter-medusa`)
- `backend-modules/mpesa/` — Custom M-Pesa (Safaricom Daraja STK Push) payment provider module for the Medusa backend

## Getting started

### Backend
The Medusa backend itself isn't in this repo (it's scaffolded separately). To stand it up:

```bash
npx create-medusa-app@latest my-backend
```

Then copy `backend-modules/mpesa` into `my-backend/src/modules/mpesa` and follow
`backend-modules/mpesa/README.md` to wire it into `medusa-config.ts`.

### Storefront

```bash
cd storefront
yarn install
cp .env.template .env.local   # fill in MEDUSA_BACKEND_URL, publishable key, etc.
yarn dev
```

## Deployment

- Backend: Railway (Postgres/Redis)
- Storefront: Cloudflare Pages

## Payments

M-Pesa via Daraja STK Push (`backend-modules/mpesa`). See that folder's README for setup, webhook config, and known limitations (no programmatic refunds without separate B2C credentials).
