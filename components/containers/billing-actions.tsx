"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  openBillingPortal,
  resumeContainerPayment,
  restartSubscription,
  deleteUnpaidContainer,
} from "@/app/actions/containers";

export function ResumePaymentButton({ containerId }: { containerId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await resumeContainerPayment(containerId);
          setPending(false);
          if (result.url) window.location.href = result.url;
          else setError(result.error ?? "Something went wrong");
        }}
      >
        <CreditCard />
        {pending ? "Preparing checkout…" : "Complete payment"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function DeleteUnpaidButton({ containerId }: { containerId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          if (!confirm("Delete this container? This cannot be undone.")) return;
          setPending(true);
          setError(null);
          const result = await deleteUnpaidContainer(containerId);
          if ("ok" in result && result.ok) {
            router.push("/dashboard");
            router.refresh();
            return;
          }
          setPending(false);
          if ("error" in result) setError(result.error ?? "Something went wrong");
        }}
      >
        <Trash2 />
        {pending ? "Deleting…" : "Delete"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ManageBillingButton({ containerId }: { containerId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await openBillingPortal(containerId);
          setPending(false);
          if (result.url) window.location.href = result.url;
          else setError(result.error ?? "Something went wrong");
        }}
      >
        <ExternalLink />
        {pending ? "Opening…" : "Manage billing (Stripe portal)"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function RestartSubscriptionButton({ containerId }: { containerId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await restartSubscription(containerId);
          setPending(false);
          if (result.url) window.location.href = result.url;
          else setError(result.error ?? "Something went wrong");
        }}
      >
        <RotateCcw />
        {pending ? "Preparing checkout…" : "Restart subscription"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
