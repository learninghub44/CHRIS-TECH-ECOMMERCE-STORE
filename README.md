# Chris Tech Ecommerce Store

Open-source ecommerce base for Kenya, built on [Medusa](https://medusajs.com) (Node.js/Next.js).

## Structure

- `backend/` — Medusa backend (from `medusajs/medusa-starter-default`), with M-Pesa wired in at `backend/src/modules/mpesa`
- `storefront/` — Next.js storefront (from `medusajs/nextjs-starter-medusa`)

## Getting started

### Backend

```bash
cd backend
yarn install
cp .env.template .env   # fill in DATABASE_URL, CORS, and MPESA_* vars
yarn medusa db:migrate
yarn medusa user -e admin@example.com -p supersecret -i admin
yarn dev   # localhost:9000, admin at /app
```

M-Pesa setup (Daraja keys, callback URL, known limitations) is documented in
`backend/src/modules/mpesa/README.md`.

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
