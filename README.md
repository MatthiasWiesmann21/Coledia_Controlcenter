# Coledia Controlcenter

Customer-facing management portal for the Coledia platform: customers sign up
(email-verified), create containers through an onboarding wizard, pay via
Stripe subscriptions (one subscription = one container), and manage billing —
while you provision the actual Coledia app containers in Dokploy.

See `AGENTS.md` for architecture, data model, and commands. This README covers
**deployment**.

## Production deployment (Dokploy)

### 1. Database

Create a MySQL database on Dokploy (e.g. `coledia_controlcenter`) and note the
connection string.

### 2. Dokploy service

- **Node**: requires Node >= 22 (Next 16 + better-auth deps). `engines` in
  `package.json` tells Nixpacks; if it still builds on Node 18, set
  `NIXPACKS_NODE_VERSION=22` as a service env var.
- **Build**: Nixpacks autodetect works. Build command:
  `npm ci && npx prisma generate && npm run build`
- **Start**: `npm run start` (runs `prisma migrate deploy` before `next start`)
- Set all env vars below, deploy, then create the admin account:

```bash
npm run db:seed
```

Change `SEED_ADMIN_PASSWORD` to a strong value **before** seeding in production.

### 3. Environment variables (production)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `mysql://user:pass@<dokploy-mysql>:3306/coledia_controlcenter` |
| `BETTER_AUTH_SECRET` | long random string |
| `BETTER_AUTH_URL` | `https://<controlcenter-domain>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Resend SMTP (or other provider) |
| `STRIPE_SECRET_KEY` | live key `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | from the Stripe webhook endpoint (step 4) |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_CLUB` / `STRIPE_PRICE_ORGANIZATION` | live price IDs (step 4) |
| `NEXT_PUBLIC_APP_URL` | `https://<controlcenter-domain>` |
| `NEXT_PUBLIC_APP_BASE_DOMAIN` | `coledia.com` |
| `APP_INTERNAL_API_URL` | `https://app.coledia.com` |
| `APP_INTERNAL_API_SECRET` | must match `INTERNAL_API_SECRET` on app.coledia.com |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | your admin login |
| `ADMIN_NOTIFY_EMAIL` | where provisioning checklists go (`m.wiesmann@wiesmann-se.ch`) |

### 4. Stripe (live mode)

1. Products → create **Starter (9 CHF/mo)**, **Club (29 CHF/mo)**,
   **Organization (99 CHF/mo)**; copy the price IDs into env.
2. Developers → Webhooks → add endpoint
   `https://<controlcenter-domain>/api/stripe/webhook` with events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_succeeded`,
   `invoice.payment_failed`. Copy the signing secret (`whsec_...`) into
   `STRIPE_WEBHOOK_SECRET`.
3. Set the live secret key into `STRIPE_SECRET_KEY`.

Local testing without the Stripe CLI:
`npm run stripe:replay -- <containerId>` replays a paid checkout webhook.

### 5. App side (coledia_app_1.0, one-time)

- Redeploy **app.coledia.com** with the latest code (internal tenant API with
  owner fields + suspension guard).
- Set `INTERNAL_API_SECRET` on app.coledia.com (same value as
  `APP_INTERNAL_API_SECRET` above).
- Run `pnpm db:migrate` against the shared app database (applies the
  `tenant_external_ref` migration).
- The shared app MySQL must accept connections from the app-containers server.

### 6. DNS

- A record for the Controlcenter domain.
- Per customer container: A record `{subdomain}.coledia.com` → app server IP
  (no wildcard). The provisioning email/checklist reminds you of every step,
  including the full per-container env block.

## Development

```bash
npm install
cp .env.example .env   # fill in values
npx prisma migrate dev
npm run db:seed
npm run dev
```
