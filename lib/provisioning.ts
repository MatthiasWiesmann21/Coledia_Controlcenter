import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { logContainerEvent } from "./events";
import { appUrlForSubdomain, CONTAINER_STATUS } from "./constants";

/**
 * Provisioning service — talks to the coledia app's internal API.
 *
 * The app containers resolve their tenant from the app's SHARED DB. This module
 * seeds / updates the tenant there via `/api/internal/tenants`, protected by a
 * shared secret. The returned tenantId is the explicit UUID chosen at container
 * creation time (`Container.appTenantId`) and later becomes the TENANT_ID env
 * var of the manually-provisioned Dokploy container.
 *
 * Env vars:
 *  APP_INTERNAL_API_URL    — URL of any reachable coledia app container
 *  APP_INTERNAL_API_SECRET — must match the app's INTERNAL_API_SECRET
 *  ADMIN_NOTIFY_EMAIL      — where provisioning checklists are sent
 */

interface InternalApiResult {
  ok: boolean;
  status: number;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * sendEmail variant that never throws: SMTP failures are logged as a
 * container event instead of aborting provisioning flows.
 */
async function safeSendEmail(
  containerId: string,
  message: Parameters<typeof sendEmail>[0],
): Promise<void> {
  try {
    await sendEmail(message);
  } catch (err) {
    console.error(`[provisioning] email failed for container ${containerId}:`, err);
    await logContainerEvent({
      containerId,
      type: "email_failed",
      message: `Email failed ("${message.subject}"): ${String(err)}`,
    }).catch(() => {});
  }
}

async function callAppApi(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
): Promise<InternalApiResult> {
  const baseUrl = process.env.APP_INTERNAL_API_URL;
  const secret = process.env.APP_INTERNAL_API_SECRET;
  if (!baseUrl || !secret) {
    return {
      ok: false,
      status: 0,
      error: "APP_INTERNAL_API_URL / APP_INTERNAL_API_SECRET not configured",
    };
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => undefined)) as
      | Record<string, unknown>
      | undefined;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : ((data?.error as string) ?? `HTTP ${res.status}`),
    };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

/**
 * Seed the tenant (+ branding + owner account) in the app's shared DB.
 * Sets container status to pending_provisioning and notifies the operator.
 * Idempotent — safe to retry (app side keys on provisionId / tenantId).
 */
export async function seedTenantInApp(containerId: string): Promise<{ ok: boolean; error?: string }> {
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { user: true, subscription: true },
  });
  if (!container) return { ok: false, error: "Container not found" };

  await prisma.container.update({
    where: { id: containerId },
    data: { status: CONTAINER_STATUS.SEEDING },
  });

  const result = await callAppApi("POST", "/api/internal/tenants", {
    provisionId: container.id,
    tenantId: container.appTenantId,
    name: container.name,
    description: container.description,
    subdomain: container.subdomain,
    plan: container.plan,
    themePreset: container.themePreset,
    themeMode: container.themeMode,
    ownerEmail: container.ownerEmail ?? container.user.email,
    ownerName: container.ownerName ?? container.user.name,
    ownerUsername: container.ownerUsername ?? undefined,
    ownerPasswordHash: container.ownerPasswordHash ?? undefined,
  });

  if (!result.ok) {
    await prisma.container.update({
      where: { id: containerId },
      data: { status: CONTAINER_STATUS.PENDING_PROVISIONING },
    });
    await logContainerEvent({
      containerId,
      type: "sync_failed",
      message: `Seeding failed: ${result.error}`,
      metadata: { status: result.status },
    });
    // Still notify the operator — a payment arrived and needs manual handling.
    await notifyAdminProvisioningRequired(containerId, { seeded: false });
    return { ok: false, error: result.error };
  }

  const tenantId = (result.data?.tenantId as string) ?? container.appTenantId;
  await prisma.container.update({
    where: { id: containerId },
    data: { appTenantId: tenantId, status: CONTAINER_STATUS.PENDING_PROVISIONING },
  });
  await logContainerEvent({
    containerId,
    type: "seeded",
    message: `Tenant seeded in app DB (${tenantId})`,
  });
  await notifyAdminProvisioningRequired(containerId, { seeded: true });
  return { ok: true };
}

/**
 * Sync mutable container fields to the app tenant (plan, status, branding, …).
 * Non-fatal on failure — the event log records sync_failed entries.
 */
export async function syncContainerToApp(
  containerId: string,
  changes: {
    plan?: string;
    tenantStatus?: string; // active | suspended
    name?: string;
    description?: string | null;
    subdomain?: string;
    themePreset?: string;
    themeMode?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const container = await prisma.container.findUnique({ where: { id: containerId } });
  if (!container) return { ok: false, error: "Container not found" };

  const result = await callAppApi("PATCH", `/api/internal/tenants/${container.appTenantId}`, {
    ...changes,
  });

  if (!result.ok) {
    await logContainerEvent({
      containerId,
      type: "sync_failed",
      message: `Tenant sync failed: ${result.error}`,
      metadata: { status: result.status, changes },
    });
    return { ok: false, error: result.error };
  }

  await logContainerEvent({
    containerId,
    type: "synced",
    message: `Synced to app: ${Object.keys(changes).join(", ")}`,
    metadata: { changes },
  });
  return { ok: true };
}

/**
 * Copy-paste-ready environment block for a new app container (Dokploy).
 * Shared by the admin provisioning card and the operator email.
 * Placeholders (<...>) are filled in by the operator — the Controlcenter does
 * not store SMTP/Stripe secrets per container.
 */
export function containerEnvLines(container: {
  subdomain: string;
  appTenantId: string;
}): string[] {
  const url = appUrlForSubdomain(container.subdomain);
  return [
    `TENANT_ID=${container.appTenantId}`,
    `DATABASE_URL=<shared app database URL>`,
    `BETTER_AUTH_SECRET=<new random secret>`,
    `BETTER_AUTH_URL=${url}`,
    `NEXT_PUBLIC_APP_URL=${url}`,
    `SMTP_HOST=<platform SMTP>`,
    `SMTP_PORT=465`,
    `SMTP_USER=<platform SMTP user>`,
    `SMTP_PASSWORD=<platform SMTP password>`,
    `SMTP_FROM=Coledia <noreply@coledia.com>`,
    `STORAGE_PATH=./uploads`,
    `# Optional: only if in-app course sales are used`,
    `# STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
    `# Realtime: TBD — leave NEXT_PUBLIC_REALTIME_URL unset for now`,
  ];
}

/**
 * Email the operator the manual Dokploy provisioning checklist with the full
 * onboarding form data. `seeded` reflects whether the app-side tenant was
 * created successfully — if not, the mail asks for a reseed via the admin UI.
 */
export async function notifyAdminProvisioningRequired(
  containerId: string,
  opts: { seeded?: boolean } = {},
): Promise<void> {
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { user: true },
  });
  if (!container) return;

  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;

  const appUrl = appUrlForSubdomain(container.subdomain);
  const ownerLine =
    container.ownerMode === "custom"
      ? `${container.ownerUsername ?? ""} <${container.ownerEmail ?? ""}> (password set by customer)`
      : `Same as customer <${container.ownerEmail ?? container.user.email}> (sets password via app verification)`;
  const seedWarning =
    opts.seeded === false
      ? "⚠️ APP SEEDING FAILED — open the admin area and use Reseed before provisioning.\n\n"
      : "";
  const seedWarningHtml =
    opts.seeded === false
      ? `<p style="color:#b45309"><strong>⚠️ App seeding failed.</strong> Open the admin area and use <em>Reseed</em> before provisioning the container.</p>`
      : "";

  const envBlock = containerEnvLines(container).join("\n");
  const text = [
    `New paid container: ${container.name}`,
    "",
    seedWarning,
    "Wizard data:",
    `  Name:        ${container.name}`,
    `  Description: ${container.description ?? "—"}`,
    `  Plan:        ${container.plan}`,
    `  Address:     ${appUrl}`,
    `  Theme:       ${container.themePreset} (${container.themeMode ?? "system"})`,
    `  App owner:   ${ownerLine}`,
    `  Customer:    ${container.user.name ?? ""} <${container.user.email}>`,
    "",
    "Dokploy steps:",
    `1. DNS: point ${container.subdomain}.${process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "coledia.com"} at the app server (no wildcard — one record per container)`,
    `2. Create a new application in Dokploy from repo coledia_app_1.0`,
    `3. Set the container environment:`,
    envBlock,
    `4. Map the domain in Dokploy (HTTPS cert) → the container port`,
    `5. Deploy, then mark the container as provisioned in the Controlcenter admin area`,
    "",
    `Container ID: ${container.id}`,
  ].join("\n");

  await safeSendEmail(containerId, {
    to,
    subject: `[Controlcenter] Provision container: ${container.name} (${container.subdomain})`,
    html: `
<h2>New paid container — ready for provisioning</h2>
${seedWarningHtml}
<h3>Wizard data</h3>
<table>
  <tr><td><strong>Name</strong></td><td>${container.name}</td></tr>
  <tr><td><strong>Description</strong></td><td>${container.description ?? "—"}</td></tr>
  <tr><td><strong>Plan</strong></td><td>${container.plan}</td></tr>
  <tr><td><strong>Address</strong></td><td><code>${appUrl}</code></td></tr>
  <tr><td><strong>Theme</strong></td><td>${container.themePreset} (${container.themeMode ?? "system"})</td></tr>
  <tr><td><strong>App owner</strong></td><td>${ownerLine}</td></tr>
  <tr><td><strong>Customer</strong></td><td>${container.user.name ?? ""} &lt;${container.user.email}&gt;</td></tr>
</table>
<h3>Dokploy checklist</h3>
<ol>
  <li>DNS: point <code>${appUrl.replace("https://", "")}</code> at the app server (no wildcard — one record per container)</li>
  <li>Create a new application in Dokploy from repo <code>coledia_app_1.0</code></li>
  <li>Set the container environment:<br><pre>${envBlock.replace(/</g, "&lt;")}</pre></li>
  <li>Map the domain in Dokploy (HTTPS cert) to the container port</li>
  <li>Deploy, then mark the container as provisioned in the Controlcenter admin area</li>
</ol>
<p>Container ID: <code>${container.id}</code></p>`,
    text,
  });

  await logContainerEvent({
    containerId,
    type: "provisioning_requested",
    message: `Provisioning checklist emailed to ${to}`,
  });
}

/**
 * Customer email after a successful payment: confirms the payment and sets
 * the expectation that the container is provisioned manually (up to ~24h)
 * and that a second email follows once it's live.
 */
export async function notifyCustomerPaymentReceived(containerId: string): Promise<void> {
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { user: true },
  });
  if (!container) return;

  const appUrl = appUrlForSubdomain(container.subdomain);
  await safeSendEmail(containerId, {
    to: container.user.email,
    subject: `Payment received — ${container.name} is being set up`,
    html: `
<h2>Payment received — we're setting up your container</h2>
<p>Hi ${container.user.name ?? "there"},</p>
<p>Thanks! Your payment for <strong>${container.name}</strong> (${container.plan})
went through and your container is now queued for setup.</p>
<p>We provision each container manually — this usually takes <strong>up to 24
hours</strong>. You'll get another email as soon as
<strong>${appUrl}</strong> is live.</p>
<p>— The Coledia team</p>`,
    text: [
      `Payment received — we're setting up your container`,
      ``,
      `Hi ${container.user.name ?? "there"},`,
      ``,
      `Thanks! Your payment for ${container.name} (${container.plan}) went through`,
      `and your container is now queued for setup.`,
      ``,
      `We provision each container manually — this usually takes up to 24 hours.`,
      `You'll get another email as soon as ${appUrl} is live.`,
      ``,
      `— The Coledia team`,
    ].join("\n"),
  });
}

/**
 * Container is live: email the customer and ask the (now reachable) app
 * container to send its own verification email to the owner — the owner
 * verifies their email on the real app before signing in.
 *
 * The verification request hits the NEW container's public better-auth
 * endpoint (/api/auth/send-verification-email), so the generated link
 * already points at the right subdomain.
 */
export async function notifyContainerLive(containerId: string): Promise<void> {
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { user: true },
  });
  if (!container) return;

  const appUrl = appUrlForSubdomain(container.subdomain);
  const ownerEmail = container.ownerEmail ?? container.user.email;

  // Ask the new container to send its own verification email to the owner.
  try {
    const res = await fetch(`${appUrl}/api/auth/send-verification-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, callbackURL: "/" }),
    });
    await logContainerEvent({
      containerId,
      type: res.ok ? "owner_verification_sent" : "owner_verification_failed",
      message: res.ok
        ? `Verification email triggered on app for ${ownerEmail}`
        : `Verification email request failed (HTTP ${res.status})`,
    });
  } catch (err) {
    await logContainerEvent({
      containerId,
      type: "owner_verification_failed",
      message: `Could not reach app for verification email: ${String(err)}`,
    });
  }

  await safeSendEmail(containerId, {
    to: container.user.email,
    subject: `${container.name} is live`,
    html: `
<h2>Your container is live</h2>
<p>Hi ${container.user.name ?? "there"},</p>
<p>Good news — <strong>${container.name}</strong> is now live at
<a href="${appUrl}">${appUrl}</a>.</p>
<p>We've sent a verification email to the app owner
(<strong>${ownerEmail}</strong>). Click the link in that email to verify the
account and sign in for the first time.</p>
<p>— The Coledia team</p>`,
    text: [
      `Your container is live`,
      ``,
      `Hi ${container.user.name ?? "there"},`,
      ``,
      `Good news — ${container.name} is now live at ${appUrl}.`,
      ``,
      `We've sent a verification email to the app owner (${ownerEmail}).`,
      `Click the link in that email to verify the account and sign in for the`,
      `first time.`,
      ``,
      `— The Coledia team`,
    ].join("\n"),
  });
}

// ─── Health check ────────────────────────────────────────────────

export interface HealthCheckItem {
  key: string;
  expected: string | null;
  actual: string | null;
  ok: boolean;
}

export interface ContainerHealthReport {
  containerId: string;
  checkedAt: string;
  /** HTTP response from the container's public URL */
  reachable: boolean;
  httpStatus: number | null;
  /** The URL answered like a coledia app (better-auth endpoint responded) */
  appVerified: boolean;
  /** Tenant row exists in the shared app DB with the expected settings */
  tenantFound: boolean;
  /** A reseed was attempted during this check (tenant was missing) */
  reseeded: boolean;
  checks: HealthCheckItem[];
  issues: string[];
  /** Set when this check changed the container status */
  statusChanged?: string;
}

/**
 * Health check for a container: verifies the app-side tenant state (via the
 * internal API GET) and probes the public URL.
 *
 * Self-healing:
 *  - tenant missing in the app DB (and payment received) → reseed once
 *  - status stuck in `seeding` but tenant exists → move to pending_provisioning
 *  - `pending_provisioning` + public URL verified as the coledia app
 *    → mark provisioned and send the "container is live" notifications
 */
export async function checkContainerHealth(
  containerId: string,
): Promise<ContainerHealthReport> {
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { user: true },
  });
  if (!container) throw new Error("Container not found");

  const report: ContainerHealthReport = {
    containerId,
    checkedAt: new Date().toISOString(),
    reachable: false,
    httpStatus: null,
    appVerified: false,
    tenantFound: false,
    reseeded: false,
    checks: [],
    issues: [],
  };

  // ── 1. Tenant state in the app DB ──
  let tenantResult = await fetchAppTenant(container.appTenantId);

  if (
    tenantResult.state === "notfound" &&
    container.status !== CONTAINER_STATUS.DRAFT &&
    container.status !== CONTAINER_STATUS.PENDING_PAYMENT
  ) {
    // Paid but never seeded (e.g. earlier failure) — heal it.
    report.reseeded = true;
    const seed = await seedTenantInApp(containerId);
    if (!seed.ok) report.issues.push(`Reseed failed: ${seed.error}`);
    tenantResult = await fetchAppTenant(container.appTenantId);
  }

  const tenant = tenantResult.tenant;
  if (tenantResult.state === "error") {
    report.issues.push(
      `App internal API check failed: ${tenantResult.error} ` +
        "(app not redeployed with GET support, or secret mismatch)",
    );
  } else if (!tenant) {
    report.issues.push("Tenant not found in the app database");
  } else {
    report.tenantFound = true;
    const branding =
      (tenant.branding as { themePreset?: string; themeMode?: string } | null) ??
      null;
    const compare = (
      key: string,
      expected: string | null,
      actual: string | null,
    ) => {
      const ok = expected === actual;
      report.checks.push({ key, expected, actual, ok });
      if (!ok)
        report.issues.push(
          `${key}: expected "${expected}", got "${actual}"`,
        );
    };
    compare("name", container.name, (tenant.name as string) ?? null);
    compare(
      "subdomain",
      container.subdomain,
      (tenant.subdomain as string) ?? null,
    );
    compare("plan", container.plan, (tenant.plan as string) ?? null);
    compare(
      "themePreset",
      container.themePreset,
      branding?.themePreset ?? null,
    );
    compare(
      "themeMode",
      container.themeMode ?? "system",
      branding?.themeMode ?? "system",
    );
  }

  // ── 2. Public URL probe ──
  const appUrl = appUrlForSubdomain(container.subdomain);
  const probe = await probeUrl(`${appUrl}/api/auth/session`);
  report.httpStatus = probe.status;
  report.reachable = probe.ok;
  report.appVerified = probe.ok && probe.looksLikeApp;
  if (probe.ok && !probe.looksLikeApp) {
    report.issues.push(
      "URL responds but does not look like the coledia app (placeholder page?)",
    );
  } else if (!probe.ok) {
    report.issues.push(
      probe.error ?? `${appUrl} not reachable (HTTP ${probe.status ?? "—"})`,
    );
  }

  // ── 3. Status transitions ──
  if (container.status === CONTAINER_STATUS.SEEDING && report.tenantFound) {
    await prisma.container.update({
      where: { id: containerId },
      data: { status: CONTAINER_STATUS.PENDING_PROVISIONING },
    });
    report.statusChanged = `${CONTAINER_STATUS.SEEDING} → ${CONTAINER_STATUS.PENDING_PROVISIONING}`;
  }

  if (
    container.status === CONTAINER_STATUS.PENDING_PROVISIONING &&
    report.reachable &&
    report.appVerified &&
    report.tenantFound
  ) {
    await prisma.container.update({
      where: { id: containerId },
      data: { status: CONTAINER_STATUS.ACTIVE },
    });
    report.statusChanged = `${CONTAINER_STATUS.PENDING_PROVISIONING} → ${CONTAINER_STATUS.ACTIVE}`;
    await logContainerEvent({
      containerId,
      type: "provisioned",
      message: "Auto-detected live by health check",
    });
    // Customer "live" mail + owner verification on the new container.
    await notifyContainerLive(containerId);
  }

  await logContainerEvent({
    containerId,
    type: "health_check",
    message: report.issues.length
      ? `Health check: ${report.issues.length} issue(s)`
      : "Health check: all good",
    metadata: {
      reachable: report.reachable,
      appVerified: report.appVerified,
      tenantFound: report.tenantFound,
      issues: report.issues,
    },
  });

  return report;
}

type AppTenantResult =
  | { state: "found"; tenant: Record<string, unknown> }
  | { state: "notfound"; tenant: null }
  | { state: "error"; tenant: null; error: string };

/** Fetch tenant + branding from the app's internal API (GET). */
async function fetchAppTenant(appTenantId: string): Promise<AppTenantResult> {
  const result = await callAppApi("GET", `/api/internal/tenants/${appTenantId}`);
  if (result.ok) {
    const tenant = result.data?.tenant as Record<string, unknown> | undefined;
    return tenant
      ? { state: "found", tenant }
      : { state: "error", tenant: null, error: "Empty tenant payload" };
  }
  if (result.status === 404) return { state: "notfound", tenant: null };
  return {
    state: "error",
    tenant: null,
    error: result.error ?? `HTTP ${result.status}`,
  };
}

const PROBE_TIMEOUT_MS = 8000;

async function probeUrl(url: string): Promise<{
  ok: boolean;
  status: number | null;
  looksLikeApp: boolean;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "application/json" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    return {
      ok: res.status < 500,
      status: res.status,
      // better-auth's session endpoint always returns JSON — a Dokploy
      // placeholder / parked page would answer HTML instead.
      looksLikeApp: contentType.includes("json"),
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      looksLikeApp: false,
      error: `Fetch failed: ${String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
