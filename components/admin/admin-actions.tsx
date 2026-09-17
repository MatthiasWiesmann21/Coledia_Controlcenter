"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminSuspendContainer,
  adminReactivateContainer,
  adminMarkProvisioned,
  adminReseedContainer,
} from "@/app/actions/admin";

type ActionResult = { ok?: boolean; error?: string };

function useAdminAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (result.error) setError(result.error);
    router.refresh();
  }

  return { pending, error, run };
}

export function AdminContainerActions({
  containerId,
  status,
}: {
  containerId: string;
  status: string;
}) {
  const { pending, error, run } = useAdminAction();
  const [notes, setNotes] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "active" && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => adminSuspendContainer(containerId))}
          >
            <PauseCircle /> Suspend
          </Button>
        )}
        {status === "suspended" && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => adminReactivateContainer(containerId))}
          >
            <PlayCircle /> Reactivate
          </Button>
        )}
        {(status === "pending_provisioning" || status === "seeding") && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => adminReseedContainer(containerId))}
          >
            <RefreshCw /> Reseed tenant
          </Button>
        )}
      </div>

      {status === "pending_provisioning" && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <label className="text-sm font-medium" htmlFor="provision-notes">
            Mark as provisioned
          </label>
          <textarea
            id="provision-notes"
            className="min-h-16 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            placeholder="Notes (Dokploy app name, server, …)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => run(() => adminMarkProvisioned(containerId, notes || undefined))}
          >
            <CheckCircle2 /> Container is live — mark provisioned
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
