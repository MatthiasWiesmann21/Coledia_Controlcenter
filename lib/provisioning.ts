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

async function callAppApi(
  method: "POST" | "PATCH",
  path: string,
  body: Record<string, unknown>,
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
      body: JSON.stringify(body),
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
    ownerEmail: container.user.email,
    ownerName: container.user.name,
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
  await notifyAdminProvisioningRequired(containerId);
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

/** Email the operator the manual Dokploy provisioning checklist. */
export async function notifyAdminProvisioningRequired(containerId: string): Promise<void> {
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { user: true },
  });
  if (!container) return;

  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;

  const appUrl = appUrlForSubdomain(container.subdomain);
  const text = [
    `New container ready for provisioning: ${container.name}`,
    "",
    "Dokploy steps:",
    `1. Create a new application from repo coledia_app_1.0`,
    `2. Set env var: TENANT_ID=${container.appTenantId}`,
    `3. Map domain: ${container.subdomain}.${process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "coledia.app"} → the container port`,
    `4. Deploy, then mark the container as provisioned in the Controlcenter admin area`,
    "",
    `Customer: ${container.user.name ?? ""} <${container.user.email}>`,
    `Plan: ${container.plan}`,
    `Container ID: ${container.id}`,
  ].join("\n");

  await sendEmail({
    to,
    subject: `[Controlcenter] Provision container: ${container.name} (${container.subdomain})`,
    html: `
<h2>New container ready for provisioning</h2>
<p><strong>${container.name}</strong> (${container.plan}) by ${container.user.name ?? ""} &lt;${container.user.email}&gt;</p>
<h3>Dokploy checklist</h3>
<ol>
  <li>Create a new application from repo <code>coledia_app_1.0</code></li>
  <li>Set env var: <code>TENANT_ID=${container.appTenantId}</code></li>
  <li>Map domain <code>${appUrl.replace("https://", "")}</code> to the container port</li>
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
