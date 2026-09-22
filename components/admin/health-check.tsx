"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminCheckContainerHealth } from "@/app/actions/admin";
import type { ContainerHealthReport } from "@/lib/provisioning";

export function HealthCheckPanel({ containerId }: { containerId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ContainerHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const result = await adminCheckContainerHealth(containerId);
    setPending(false);
    if (result.error) setError(result.error);
    if (result.report) setReport(result.report);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={pending}
        onClick={run}
      >
        <Activity /> {pending ? "Checking…" : "Run health check"}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {report && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant={report.reachable ? "success" : "secondary"}>
              {report.reachable ? "URL reachable" : "URL unreachable"}
            </Badge>
            <Badge variant={report.appVerified ? "success" : "secondary"}>
              {report.appVerified ? "coledia app verified" : "app not verified"}
            </Badge>
            <Badge variant={report.tenantFound ? "success" : "destructive"}>
              {report.tenantFound ? "tenant in app DB" : "tenant missing"}
            </Badge>
            {report.reseeded && <Badge variant="secondary">reseeded</Badge>}
            {report.statusChanged && (
              <Badge variant="success">{report.statusChanged}</Badge>
            )}
          </div>

          {report.checks.length > 0 && (
            <ul className="flex flex-col gap-1">
              {report.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  {c.ok ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <XCircle className="size-4 text-destructive" />
                  )}
                  <span className="font-mono text-xs">{c.key}</span>
                  <span className="text-muted-foreground">
                    {c.ok
                      ? `= ${c.actual}`
                      : `expected "${c.expected}", got "${c.actual}"`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {report.issues.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              {report.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            Checked {new Date(report.checkedAt).toLocaleString("en-CH")}
            {report.httpStatus != null && ` · HTTP ${report.httpStatus}`}
          </p>
        </div>
      )}
    </div>
  );
}
