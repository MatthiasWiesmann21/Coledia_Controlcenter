import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  notifyCustomerPaymentReceived,
  seedTenantInApp,
  syncContainerToApp,
} from "@/lib/provisioning";
import { logContainerEvent } from "@/lib/events";
import { CONTAINER_STATUS, PLANS } from "@/lib/constants";

/**
 * Stripe webhook handler (Controlcenter endpoint).
 *
 * Handles:
 *  - checkout.session.completed (container plan subscription started / restarted)
 *  - customer.subscription.updated / deleted (plan changes via portal, cancellation)
 *  - invoice.payment_succeeded / invoice.payment_failed (payment records)
 *
 * Signature verification uses the raw body. Events carrying app-side metadata
 * (tenantId / course purchases) are ignored — the coledia app has its own
 * webhook endpoint for those.
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        await handleInvoice(
          event.data.object as Stripe.Invoice,
          event.type === "invoice.payment_succeeded",
        );
        break;
      default:
        console.log(`[stripe] unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe] webhook handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Handlers ────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const containerId = metadata.containerId;
  // Foreign checkouts (app-side metadata) are not ours to process.
  if (!containerId || metadata.type !== "plan_subscription") return;

  const container = await prisma.container.findUnique({
    where: { id: containerId },
    select: { id: true, status: true },
  });
  if (!container) return;

  const stripeSubscriptionId = session.subscription as string;
  const stripeCustomerId = session.customer as string;

  let currentPeriodEnd: Date | null = null;
  if (stripeSubscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(stripeSubscriptionId);
    currentPeriodEnd = extractPeriodEnd(subscription);
  }

  await prisma.subscription.upsert({
    where: { containerId },
    create: {
      containerId,
      stripeCustomerId,
      stripeSubscriptionId,
      plan: metadata.plan ?? PLANS.STARTER,
      status: "active",
      currentPeriodEnd,
    },
    update: {
      stripeCustomerId,
      stripeSubscriptionId,
      plan: metadata.plan ?? PLANS.STARTER,
      status: "active",
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  await logContainerEvent({
    containerId,
    type: "payment_completed",
    message: `Checkout completed (plan: ${metadata.plan ?? "unknown"})`,
    metadata: { stripeCustomerId, stripeSubscriptionId },
  });

  if (container.status === CONTAINER_STATUS.SUSPENDED) {
    // Restarted subscription on an existing tenant → reactivate, no reseed.
    await prisma.container.update({
      where: { id: containerId },
      data: { status: CONTAINER_STATUS.ACTIVE },
    });
    await syncContainerToApp(containerId, {
      tenantStatus: "active",
      plan: metadata.plan,
    });
    await logContainerEvent({
      containerId,
      type: "reactivated",
      message: "Subscription restarted — container reactivated",
    });
    return;
  }

  await prisma.container.update({
    where: { id: containerId },
    data: { status: CONTAINER_STATUS.SEEDING },
  });

  // Tell the customer: payment went through, container will be set up
  // manually (up to ~24h) and a second email follows once it's live.
  await notifyCustomerPaymentReceived(containerId);

  const result = await seedTenantInApp(containerId);
  if (!result.ok) {
    console.error(`[stripe] seeding failed for container ${containerId}: ${result.error}`);
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const localSub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    include: { container: true },
  });
  if (!localSub) return; // not ours (e.g. app-side tenant subscription)

  const status = mapStripeStatus(subscription.status);
  const plan = planFromSubscription(subscription) ?? localSub.plan;

  await prisma.subscription.update({
    where: { id: localSub.id },
    data: {
      status,
      plan,
      currentPeriodEnd: extractPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  if (status === "canceled") {
    // No free tier: without an active subscription the container is suspended.
    await prisma.container.update({
      where: { id: localSub.containerId },
      data: { status: CONTAINER_STATUS.SUSPENDED },
    });
    await syncContainerToApp(localSub.containerId, {
      tenantStatus: "suspended",
    });
    await logContainerEvent({
      containerId: localSub.containerId,
      type: "suspended",
      message: "Subscription canceled — container suspended",
    });
    return;
  }

  // Plan or status changed (portal upgrade/downgrade, dunning, reactivation)
  const updates: Record<string, string> = {};
  if (plan !== localSub.plan) updates.plan = plan;
  if (
    status === "active" &&
    localSub.container.status === CONTAINER_STATUS.SUSPENDED
  ) {
    await prisma.container.update({
      where: { id: localSub.containerId },
      data: { status: CONTAINER_STATUS.ACTIVE, plan },
    });
    updates.tenantStatus = "active";
  } else if (plan !== localSub.plan) {
    await prisma.container.update({
      where: { id: localSub.containerId },
      data: { plan },
    });
  }

  if (Object.keys(updates).length > 0) {
    await syncContainerToApp(localSub.containerId, updates);
    await logContainerEvent({
      containerId: localSub.containerId,
      type: "plan_changed",
      message: `Subscription ${status} (plan: ${plan})`,
      metadata: updates,
    });
  }
}

async function handleInvoice(invoice: Stripe.Invoice, succeeded: boolean) {
  const stripeSubscriptionId = extractSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const localSub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId },
    select: { containerId: true },
  });
  if (!localSub) return;

  await prisma.payment.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      containerId: localSub.containerId,
      stripeInvoiceId: invoice.id,
      amount: (((succeeded ? invoice.amount_paid : invoice.amount_due) ?? 0) / 100).toString(),
      currency: invoice.currency ?? "chf",
      status: succeeded ? "succeeded" : "failed",
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    },
    update: {
      status: succeeded ? "succeeded" : "failed",
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    },
  });

  if (!succeeded) {
    await logContainerEvent({
      containerId: localSub.containerId,
      type: "payment_failed",
      message: `Invoice ${invoice.id} payment failed`,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "trialing":
      return "trialing";
    case "canceled":
    case "unpaid":
      return "canceled";
    default:
      return "incomplete";
  }
}

/** Determine our plan key from the subscription's current price id. */
function planFromSubscription(subscription: Stripe.Subscription): string | null {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return null;
  const map: Record<string, string | undefined> = {
    [process.env.STRIPE_PRICE_STARTER ?? ""]: PLANS.STARTER,
    [process.env.STRIPE_PRICE_CLUB ?? ""]: PLANS.CLUB,
    [process.env.STRIPE_PRICE_ORGANIZATION ?? ""]: PLANS.ORGANIZATION,
  };
  return map[priceId] ?? null;
}

function extractPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0];
  const periodEnd =
    item?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end;
  return periodEnd ? new Date(periodEnd * 1000) : null;
}

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as unknown as {
    subscription?: string | Stripe.Subscription | null;
  }).subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}
