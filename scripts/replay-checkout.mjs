#!/usr/bin/env node
/**
 * Replay a Stripe `checkout.session.completed` webhook locally.
 *
 * Use when developing without the Stripe CLI (`stripe listen`). Finds the
 * paid checkout session for a container in your Stripe test account and
 * POSTs a correctly-signed webhook event to the local dev server — the
 * same payload `stripe listen` would forward.
 *
 * Usage: npm run stripe:replay -- <containerId>
 */

import crypto from "node:crypto";
import { config } from "dotenv";

config();

const containerId = process.argv[2];
if (!containerId) {
  console.error("Usage: npm run stripe:replay -- <containerId>");
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY;
const whsec = process.env.STRIPE_WEBHOOK_SECRET;
const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
if (!key || key.includes("...")) {
  console.error("STRIPE_SECRET_KEY is not configured in .env");
  process.exit(1);
}
if (!whsec || whsec.includes("...")) {
  console.error("STRIPE_WEBHOOK_SECRET is not configured in .env");
  process.exit(1);
}

// Find the completed/paid checkout session for this container
const res = await fetch("https://api.stripe.com/v1/checkout/sessions?limit=50", {
  headers: { Authorization: `Bearer ${key}` },
});
const { data: sessions } = await res.json();
const session = sessions.find(
  (s) => s.metadata?.containerId === containerId && s.payment_status === "paid",
);
if (!session) {
  console.error(`No paid checkout session found for container ${containerId}`);
  process.exit(1);
}
console.log(`Found paid session ${session.id} (sub: ${session.subscription})`);

const event = {
  id: `evt_replay_${Date.now()}`,
  object: "event",
  api_version: "2025-02-24.acacia",
  created: Math.floor(Date.now() / 1000),
  type: "checkout.session.completed",
  livemode: false,
  data: { object: session },
};
const payload = JSON.stringify(event);
const t = Math.floor(Date.now() / 1000);
const sig = crypto
  .createHmac("sha256", whsec)
  .update(`${t}.${payload}`)
  .digest("hex");

const wr = await fetch(`${base}/api/stripe/webhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "stripe-signature": `t=${t},v1=${sig}`,
  },
  body: payload,
});
console.log(`Webhook → ${base}: ${wr.status}`, await wr.text());
