"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  notifyContainerLive,
  syncContainerToApp,
  seedTenantInApp,
  checkContainerHealth,
  type ContainerHealthReport,
} from "@/lib/provisioning";
import { logContainerEvent } from "@/lib/events";
import { CONTAINER_STATUS } from "@/lib/constants";

/** Admin: suspend a container (and its app tenant). */
export async function adminSuspendContainer(containerId: string) {
  await requireAdmin();
  const container = await prisma.container.findUnique({ where: { id: containerId } });
  if (!container) return { error: "Container not found" };
  if (container.status !== CONTAINER_STATUS.ACTIVE) {
    return { error: "Only active containers can be suspended" };
  }

  await prisma.container.update({
    where: { id: containerId },
    data: { status: CONTAINER_STATUS.SUSPENDED },
  });
  await syncContainerToApp(containerId, { tenantStatus: "suspended" });
  await logContainerEvent({
    containerId,
    type: "suspended",
    message: "Suspended by admin",
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/containers/${containerId}`);
  return { ok: true };
}

/** Admin: reactivate a suspended container (and its app tenant). */
export async function adminReactivateContainer(containerId: string) {
  await requireAdmin();
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { subscription: true },
  });
  if (!container) return { error: "Container not found" };
  if (container.status !== CONTAINER_STATUS.SUSPENDED) {
    return { error: "Only suspended containers can be reactivated" };
  }
  if (container.subscription?.status === "canceled") {
    return { error: "The subscription is canceled — the customer must restart it first" };
  }

  await prisma.container.update({
    where: { id: containerId },
    data: { status: CONTAINER_STATUS.ACTIVE },
  });
  await syncContainerToApp(containerId, { tenantStatus: "active" });
  await logContainerEvent({
    containerId,
    type: "reactivated",
    message: "Reactivated by admin",
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/containers/${containerId}`);
  return { ok: true };
}

/** Admin: mark a pending container as provisioned (manual Dokploy step done). */
export async function adminMarkProvisioned(containerId: string, notes?: string) {
  await requireAdmin();
  const container = await prisma.container.findUnique({ where: { id: containerId } });
  if (!container) return { error: "Container not found" };
  if (container.status !== CONTAINER_STATUS.PENDING_PROVISIONING) {
    return { error: "This container is not waiting for provisioning" };
  }

  await prisma.container.update({
    where: { id: containerId },
    data: { status: CONTAINER_STATUS.ACTIVE, provisionNotes: notes || null },
  });
  await logContainerEvent({
    containerId,
    type: "provisioned",
    message: "Marked provisioned by admin" + (notes ? `: ${notes}` : ""),
  });
  // Container is deployed now — tell the customer and trigger the owner's
  // verification email on the app itself (non-fatal on failure).
  await notifyContainerLive(containerId);
  revalidatePath("/admin");
  revalidatePath(`/admin/containers/${containerId}`);
  return { ok: true };
}

/** Admin: re-run the tenant seeding (idempotent). */
export async function adminReseedContainer(containerId: string) {
  await requireAdmin();
  const container = await prisma.container.findUnique({ where: { id: containerId } });
  if (!container) return { error: "Container not found" };
  if (
    container.status === CONTAINER_STATUS.DRAFT ||
    container.status === CONTAINER_STATUS.PENDING_PAYMENT
  ) {
    return { error: "This container has not been paid yet" };
  }

  const result = await seedTenantInApp(containerId);
  revalidatePath("/admin");
  revalidatePath(`/admin/containers/${containerId}`);
  return result;
}

/** Admin: run the health check now (same probe the cron endpoint runs). */
export async function adminCheckContainerHealth(
  containerId: string,
): Promise<{ ok?: boolean; error?: string; report?: ContainerHealthReport }> {
  await requireAdmin();
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    select: { id: true },
  });
  if (!container) return { error: "Container not found" };

  try {
    const report = await checkContainerHealth(containerId);
    revalidatePath("/admin");
    revalidatePath(`/admin/containers/${containerId}`);
    return { ok: true, report };
  } catch (err) {
    return { error: String(err) };
  }
}

const notesSchema = z.string().max(2000).optional();

/** Admin: update provisioning notes. */
export async function adminUpdateProvisionNotes(containerId: string, notes: string) {
  await requireAdmin();
  const parsed = notesSchema.safeParse(notes);
  if (!parsed.success) return { error: "Notes too long" };

  const container = await prisma.container.findUnique({ where: { id: containerId } });
  if (!container) return { error: "Container not found" };

  await prisma.container.update({
    where: { id: containerId },
    data: { provisionNotes: parsed.data || null },
  });
  revalidatePath(`/admin/containers/${containerId}`);
  return { ok: true };
}
