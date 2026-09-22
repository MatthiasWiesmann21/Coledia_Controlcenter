<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Overview

The Coledia Controlcenter is the customer-facing management site for the Coledia
platform (`coledia_app_1.0` is the multi-tenant community LMS, `coledia_website`
the marketing site — both separate repos/Dokploy instances).

Customers sign up here, verify their email, and create containers (their own
Coledia app instances) through a multi-step onboarding wizard with Stripe
Checkout. One Stripe subscription = one container. The Controlcenter then seeds
the tenant into the coledia app's shared DB via the app's internal API
(`/api/internal/tenants`) and emails a provisioning checklist — the actual
Dokploy container is created manually (for now), with `TENANT_ID` set to the
container's `appTenantId` (a UUID chosen at container creation).

## Tech Stack

- Next.js 16 (App Router, Turbopack), React 19, Tailwind v4 (CSS-first `@theme` tokens), npm
- Prisma + MySQL — this repo's OWN database (not shared with the app)
- Better-Auth (email+password, email verification) + nodemailer SMTP
- Stripe (subscriptions + webhooks + billing portal)
- Route protection via `proxy.ts` (Next.js 16 replaced `middleware.ts`)

## Data model (prisma/schema.prisma)

- Better-Auth tables: `User` (with `role`: customer|admin), `Session`, `Account`, `Verification`
- `Container` — name/description/subdomain/themePreset/themeMode/plan/status/`appTenantId` (explicit UUID → app Tenant.id + Dokploy TENANT_ID); `type` mirrors the plan tier (starter|club|organization) — the onboarding plan selector is the container type selector. Owner fields: `ownerMode` (same|custom), `ownerEmail`, `ownerName`, `ownerUsername`, `ownerPasswordHash` (better-auth scrypt hash — plaintext is never stored; it becomes the app owner's credential account)
- `Subscription` — one per container (`containerId @unique`), mirrors Stripe state
- `Payment` — invoice records (incl. failed payments for the admin view)
- `ContainerEvent` — lifecycle/audit log (created, payment_completed, seeded, provisioned, suspended, sync_failed, …)

Container status flow: `draft/pending_payment → seeding → pending_provisioning → active`, plus `suspended` / `cancelled`.

## Plans

Starter 9 CHF · Club 29 CHF · Organization 99 CHF — ALL plans are paid
(`lib/constants.ts`, prices IDs via `STRIPE_PRICE_*` env). No active Stripe
subscription ⇒ container suspended (no free fallback).

## App integration (internal API)

- Seeding: POST `{APP_INTERNAL_API_URL}/api/internal/tenants` with Bearer
  `APP_INTERNAL_API_SECRET` — creates Tenant (explicit UUID id) + Branding +
  owner User/Membership in the app DB. Idempotent via `provisionId`/`tenantId`.
- Sync: PATCH `/api/internal/tenants/{appTenantId}` for plan/status/branding changes.
- Owner welcome: when admin marks a container provisioned, the Controlcenter
  POSTs to `{container-url}/api/auth/send-verification-email` on the NEW
  container (public better-auth endpoint) so the owner verifies on the real
  app domain — see `notifyContainerLive` in `lib/provisioning.ts`.
- Emails (`lib/provisioning.ts`): payment-received mail to the customer on
  checkout completion (~24h manual setup expectation), provisioning checklist
  to `ADMIN_NOTIFY_EMAIL`, "container is live" mail when marked provisioned.
  All sends are non-fatal (`safeSendEmail` logs `email_failed` events instead
  of aborting the flow).
- Health check: `checkContainerHealth` reads back the tenant via GET
  `/api/internal/tenants/{appTenantId}` (theme/plan/subdomain comparison),
  probes `{subdomain}.{base}/api/auth/session`, auto-reseeds missing tenants,
  and auto-marks a verified-live container `active` (+ live emails). Runs on
  demand in the admin UI and on a schedule via `/api/cron/container-health`
  (Bearer `CRON_SECRET`).
- See `lib/provisioning.ts`.

## Pages

- `/profile` — customer self-service: name, email (changeEmail verification),
  password change, appearance (next-themes), subscriptions + receipts
  (invoices link to Stripe `hostedInvoiceUrl`, billing portal per container).

## Commands

```bash
npm install            # Install dependencies
npm run dev            # Dev server (http://localhost:3000)
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run build          # Production build
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Apply migrations (production)
npm run db:seed        # Create the admin account (SEED_ADMIN_* env)
npm run stripe:replay -- <containerId>  # Replay checkout.session.completed locally (no Stripe CLI needed)
```

## Environment

Copy `.env.example` to `.env`. Key groups: `DATABASE_URL` (own MySQL),
Better-Auth, SMTP, Stripe (+ 3 price IDs), `NEXT_PUBLIC_APP_BASE_DOMAIN`,
`APP_INTERNAL_API_URL`/`APP_INTERNAL_API_SECRET` (tenant seeding),
`SEED_ADMIN_*` and `ADMIN_NOTIFY_EMAIL`.

Local Stripe testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
and set the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`. Without the Stripe
CLI use `npm run stripe:replay -- <containerId>` instead.

## Deployment

Full production runbook (Dokploy build/start commands, env table, Stripe live
setup incl. webhook registration, DNS, one-time app-side steps) lives in
`README.md`. Key points:

- `npm run start` runs `prisma migrate deploy` before `next start` — Dokploy
  just needs the env vars set.
- Customer containers live at `{subdomain}.coledia.com`; there is NO wildcard
  DNS, so each container needs its own DNS record (listed in the provisioning
  checklist email + admin card, which also render the full per-container env
  block via `containerEnvLines` in `lib/provisioning.ts`).
- The Controlcenter portal is `robots: noindex`.
