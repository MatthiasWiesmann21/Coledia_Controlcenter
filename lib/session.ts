import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

/**
 * Get the current Better-Auth session (server-side).
 * Returns null when the request is unauthenticated.
 * Cached per request via React cache().
 */
export const getSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
});

/** Require an authenticated user; redirects to /sign-in otherwise. */
export async function requireUser(callbackURL = "/dashboard") {
  const session = await getSession();
  if (!session) {
    redirect(`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`);
  }
  return session;
}

/**
 * Require a verified email when verification is required by config.
 * Better-Auth already blocks sign-in for unverified users when
 * requireEmailVerification is true; this is a defensive check for
 * auth'd routes.
 */
export async function requireVerifiedUser(callbackURL = "/dashboard") {
  const session = await requireUser(callbackURL);
  const verificationRequired =
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true" ||
    (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false" &&
      process.env.NODE_ENV === "production");
  if (verificationRequired && !session.user.emailVerified) {
    redirect("/verify-email");
  }
  return session;
}

/** Require an admin user; redirects non-admins to the dashboard. */
export async function requireAdmin() {
  const session = await requireVerifiedUser("/admin");
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }
  return session;
}
