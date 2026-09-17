import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const session = await getSession();
  const { callbackURL } = await searchParams;
  if (session) redirect(callbackURL ?? "/dashboard");

  return (
    <>
      <SignInForm callbackURL={callbackURL ?? "/dashboard"} />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        <Link
          href="/forgot-password"
          className="text-primary underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </p>
    </>
  );
}
