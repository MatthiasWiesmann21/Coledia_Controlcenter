"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireVerifiedUser } from "@/lib/session";
import { onboardingSchema, containerUpdateSchema, subdomainSchema } from "@/lib/schemas";
import {
  createPlanCheckoutSession,
  createBillingPortalSession,
} from "@/lib/stripe";
import { syncContainerToApp, seedTenantInApp } from "@/lib/provisioning";
import { logContainerEvent } from "@/lib/events";
import { CONTAINER_STATUS } from "@/lib/constants";
import type { OnboardingInput } from "@/lib/schemas";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export type CheckoutResult = { error?: string; url?: string };
export type UpdateResult = { error?: string; ok?: boolean; subdomainDeferred?: boolean };

/** Ownership guard: the container must belong to the current user. */
async function requireOwnedContainer(containerId: string) {
  const session = await requireVerifiedUser();
  const container = await prisma.container.findUnique({
    where: { id: containerId },
    include: { subscription: true },
  });
  if (!container || container.userId !== session.user.id) {
    throw new Error("Container not found");
  }
  return { session, container };
}

/**
 * Onboarding completion: create the container + subscription rows and start
 * Stripe Checkout. All plans are paid — payment happens before seeding.
 */
export async function startContainerCheckout(input: OnboardingInput): Promise<CheckoutResult> {
  const session = await requireVerifiedUser();
  const parsed = onboardingSchema.safeParse({
    ...input,
    subdomain: input.subdomain.toLowerCase(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const taken = await prisma.container.findUnique({
    where: { subdomain: data.subdomain },
    select: { id: true },
  });
  if (taken) return { error: "This subdomain is already taken" };

  const container = await prisma.container.create({
    data: {
      userId: session.user.id,
      name: data.name,
      description: data.description || null,
      type: data.type,
      subdomain: data.subdomain,
      themePreset: data.themePreset,
      themeMode: data.themeMode,
      plan: data.plan,
      status: CONTAINER_STATUS.PENDING_PAYMENT,
      appTenantId: randomUUID(),
      subscription: {
        create: { plan: data.plan, status: "incomplete" },
      },
    },
  });
  await logContainerEvent({
    containerId: container.id,
    type: "created",
    message: `Container created from onboarding (plan: ${data.plan})`,
  });

  try {
    const checkout = await createPlanCheckoutSession({
      containerId: container.id,
      plan: data.plan,
      customerEmail: session.user.email,
      successUrl: `${appUrl()}/containers/${container.id}?checkout=success`,
      cancelUrl: `${appUrl()}/containers/${container.id}?checkout=cancelled`,
    });
    if (!checkout.url) throw new Error("Stripe returned no checkout URL");
    return { url: checkout.url };
  } catch (err) {
    await logContainerEvent({
      containerId: container.id,
      type: "checkout_failed",
      message: String(err),
    });
    return { error: "Could not start the checkout. Please try again." };
  }
}

/** Resume a stuck checkout (payment abandoned or failed earlier). */
export async function resumeContainerPayment(containerId: string): Promise<CheckoutResult> {
  const { session, container } = await requireOwnedContainer(containerId);
  if (
    container.status !== CONTAINER_STATUS.PENDING_PAYMENT &&
    container.status !== CONTAINER_STATUS.DRAFT
  ) {
    return { error: "This container is already paid" };
  }

  try {
    const checkout = await createPlanCheckoutSession({
      containerId: container.id,
      plan: container.plan,
      customerEmail: session.user.email,
      stripeCustomerId: container.subscription?.stripeCustomerId,
      successUrl: `${appUrl()}/containers/${container.id}?checkout=success`,
      cancelUrl: `${appUrl()}/containers/${container.id}?checkout=cancelled`,
    });
    if (!checkout.url) throw new Error("Stripe returned no checkout URL");
    return { url: checkout.url };
  } catch {
    return { error: "Could not start the checkout. Please try again." };
  }
}

/** Delete a container that was never paid (draft / pending_payment only). */
export async function deleteUnpaidContainer(containerId: string) {
  const { container } = await requireOwnedContainer(containerId);
  if (
    container.status !== CONTAINER_STATUS.PENDING_PAYMENT &&
    container.status !== CONTAINER_STATUS.DRAFT
  ) {
    return { error: "Only unpaid containers can be deleted" };
  }
  await prisma.container.delete({ where: { id: containerId } });
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Update container metadata; syncs to the app when already seeded. */
export async function updateContainer(containerId: string, input: unknown): Promise<UpdateResult> {
  const { container } = await requireOwnedContainer(containerId);
  const parsed = containerUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  if (data.subdomain && data.subdomain !== container.subdomain) {
    const normalized = data.subdomain.toLowerCase();
    const validSub = subdomainSchema.safeParse(normalized);
    if (!validSub.success) return { error: validSub.error.issues[0]?.message };
    const taken = await prisma.container.findUnique({
      where: { subdomain: normalized },
      select: { id: true },
    });
    if (taken) return { error: "This subdomain is already taken" };
    data.subdomain = normalized;
  }

  const seeded =
    container.status !== CONTAINER_STATUS.DRAFT &&
    container.status !== CONTAINER_STATUS.PENDING_PAYMENT;

  // Subdomain changes need a Dokploy domain remap — too risky to apply
  // automatically; sync everything else to the app.
  const hasSyncableChange =
    data.name !== undefined ||
    data.description !== undefined ||
    data.themePreset !== undefined ||
    data.themeMode !== undefined;

  await prisma.container.update({
    where: { id: containerId },
    data,
  });

  if (seeded && hasSyncableChange) {
    await syncContainerToApp(containerId, {
      name: data.name,
      description: data.description,
      themePreset: data.themePreset,
      themeMode: data.themeMode,
    });
  }

  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
    subdomainDeferred: Boolean(data.subdomain && data.subdomain !== container.subdomain),
  };
}

/** Open the Stripe Billing Portal (payment methods, invoices, cancel, plan change). */
export async function openBillingPortal(containerId: string): Promise<CheckoutResult> {
  const { container } = await requireOwnedContainer(containerId);
  const customerId = container.subscription?.stripeCustomerId;
  if (!customerId) return { error: "No billing account found for this container yet" };

  try {
    const portal = await createBillingPortalSession({
      stripeCustomerId: customerId,
      returnUrl: `${appUrl()}/containers/${containerId}`,
    });
    return { url: portal.url };
  } catch {
    return { error: "Could not open the billing portal" };
  }
}

/**
 * Restart a canceled subscription with a fresh checkout (same container,
 * new Stripe subscription). The webhook switches the IDs over.
 */
export async function restartSubscription(containerId: string): Promise<CheckoutResult> {
  const { session, container } = await requireOwnedContainer(containerId);
  if (container.subscription?.status !== "canceled") {
    return { error: "The subscription is not canceled" };
  }

  try {
    const checkout = await createPlanCheckoutSession({
      containerId: container.id,
      plan: container.plan,
      customerEmail: session.user.email,
      stripeCustomerId: container.subscription?.stripeCustomerId,
      successUrl: `${appUrl()}/containers/${container.id}?checkout=success`,
      cancelUrl: `${appUrl()}/containers/${container.id}?checkout=cancelled`,
    });
    if (!checkout.url) throw new Error("Stripe returned no checkout URL");
    return { url: checkout.url };
  } catch {
    return { error: "Could not start the checkout. Please try again." };
  }
}

/** Retry seeding into the app DB (e.g. after an earlier sync failure). */
export async function retrySeeding(containerId: string) {
  const { container } = await requireOwnedContainer(containerId);
  if (container.status !== CONTAINER_STATUS.PENDING_PROVISIONING) {
    return { error: "This container is not waiting for provisioning" };
  }
  const result = await seedTenantInApp(containerId);
  revalidatePath(`/containers/${containerId}`);
  return result;
}
