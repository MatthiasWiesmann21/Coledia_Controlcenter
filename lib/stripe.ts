import Stripe from "stripe";

/**
 * Stripe integration helpers for the Controlcenter.
 *
 * - Container plan subscriptions (platform → customer), one subscription per container
 * - Webhook signature verification against the raw body (see app/api/stripe/webhook)
 *
 * Env vars:
 *  STRIPE_SECRET_KEY          — platform secret key
 *  STRIPE_WEBHOOK_SECRET      — webhook signing secret (own endpoint, separate from the app's)
 *  STRIPE_PRICE_STARTER / _CLUB / _ORGANIZATION — price IDs from the Stripe dashboard
 *  NEXT_PUBLIC_APP_URL        — base URL for success/cancel redirects
 */

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeInstance = new Stripe(key, {
      apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    });
  }
  return stripeInstance;
}

/** Price IDs for each plan (all three plans are paid). */
export function getPlanPriceId(plan: string): string | null {
  switch (plan) {
    case "starter":
      return process.env.STRIPE_PRICE_STARTER ?? null;
    case "club":
      return process.env.STRIPE_PRICE_CLUB ?? null;
    case "organization":
      return process.env.STRIPE_PRICE_ORGANIZATION ?? null;
    default:
      return null;
  }
}

/** Create a Checkout session for a container plan subscription. */
export async function createPlanCheckoutSession(opts: {
  containerId: string;
  plan: string;
  customerEmail: string;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const priceId = getPlanPriceId(opts.plan);
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${opts.plan}`);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: opts.stripeCustomerId ?? undefined,
    customer_email: opts.stripeCustomerId ? undefined : opts.customerEmail,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      containerId: opts.containerId,
      plan: opts.plan,
      type: "plan_subscription",
    },
    subscription_data: {
      metadata: {
        containerId: opts.containerId,
        plan: opts.plan,
        type: "plan_subscription",
      },
    },
  });
}

/** Create a billing portal session for subscription management. */
export async function createBillingPortalSession(opts: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: opts.stripeCustomerId,
    return_url: opts.returnUrl,
  });
}
