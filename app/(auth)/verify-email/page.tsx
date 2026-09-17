import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResendVerification } from "@/components/auth/resend-verification";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await getSession();
  const { email } = await searchParams;
  const targetEmail = session?.user.email ?? email;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email address</CardTitle>
        <CardDescription>
          We&apos;ve sent a verification link
          {targetEmail ? (
            <>
              {" "}
              to <span className="font-medium">{targetEmail}</span>
            </>
          ) : (
            " to your email address"
          )}
          . Click the link to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ResendVerification email={targetEmail} />
      </CardContent>
    </Card>
  );
}
