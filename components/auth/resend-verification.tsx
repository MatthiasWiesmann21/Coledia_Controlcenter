"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function ResendVerification({ email }: { email?: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function resend() {
    if (!email) return;
    setPending(true);
    setError(null);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/dashboard",
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not resend the verification email");
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={resend}
        disabled={pending || sent || !email}
      >
        {sent ? "Email sent — check your inbox" : pending ? "Sending…" : "Resend verification email"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Already verified?{" "}
        <a href="/dashboard" className="text-primary underline-offset-4 hover:underline">
          Continue to the dashboard
        </a>
      </p>
    </div>
  );
}
