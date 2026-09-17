import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { Badge, statusBadgeVariant } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CONTAINER_STATUS,
  CONTAINER_STATUS_LABELS,
  type ContainerStatus,
} from "@/lib/constants";
import { AdminContainerActions } from "@/components/admin/admin-actions";

export const metadata: Metadata = { title: "Container (Admin)" };

export default async function AdminContainerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true, createdAt: true } },
      subscription: true,
      payments: { orderBy: { createdAt: "desc" }, take: 10 },
      events: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!container) notFound();

  const baseDomain = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "coledia.app";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{container.name}</h1>
        <Badge variant={statusBadgeVariant(container.status)}>
          {CONTAINER_STATUS_LABELS[container.status as ContainerStatus] ?? container.status}
        </Badge>
      </div>

      {/* Provisioning card */}
      {container.status === CONTAINER_STATUS.PENDING_PROVISIONING && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>Provisioning checklist</CardTitle>
            <CardDescription>
              Manual Dokploy steps — then mark the container as provisioned below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
              <li>
                Create a new application in Dokploy from repo{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">coledia_app_1.0</code>
              </li>
              <li>
                Set the environment variable:
                <pre className="mt-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                  TENANT_ID={container.appTenantId}
                </pre>
              </li>
              <li>
                Map the domain{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {container.subdomain}.{baseDomain}
                </code>{" "}
                to the container port
              </li>
              <li>Deploy the container</li>
            </ol>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Container</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <Row label="ID" value={container.id} mono />
              <Row label="Tenant ID (App)" value={container.appTenantId} mono />
              <Row label="Subdomain" value={container.subdomain} mono />
              <Row label="Plan" value={container.plan} />
              <Row label="Type" value={container.type} />
              <Row label="Theme" value={`${container.themePreset} (${container.themeMode ?? "system"})`} />
              <Row label="Created" value={container.createdAt.toLocaleString("en-CH")} />
              {container.provisionNotes && <Row label="Provision notes" value={container.provisionNotes} />}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer &amp; billing</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <Row label="Customer" value={`${container.user.name ?? ""} <${container.user.email}>`} />
              <Row label="Member since" value={container.user.createdAt.toLocaleDateString("en-CH")} />
              <Row
                label="Subscription"
                value={
                  container.subscription
                    ? `${container.subscription.status}${container.subscription.cancelAtPeriodEnd ? " (cancels at period end)" : ""}`
                    : "—"
                }
              />
              {container.subscription?.stripeSubscriptionId && (
                <Row label="Stripe sub" value={container.subscription.stripeSubscriptionId} mono />
              )}
              {container.subscription?.currentPeriodEnd && (
                <Row
                  label="Period end"
                  value={container.subscription.currentPeriodEnd.toLocaleDateString("en-CH")}
                />
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminContainerActions containerId={container.id} status={container.status} />
          </CardContent>
        </Card>

        {/* Events */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Event log</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {container.events.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-4">
                  <span className="text-muted-foreground">{e.message ?? e.type}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {e.createdAt.toLocaleString("en-CH")}
                  </span>
                </li>
              ))}
              {container.events.length === 0 && (
                <li className="text-muted-foreground">No events yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Payments */}
        {container.payments.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {container.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Badge variant={p.status === "succeeded" ? "success" : p.status === "failed" ? "destructive" : "secondary"}>
                      {p.status}
                    </Badge>
                    <span>
                      {p.amount.toString()} {p.currency.toUpperCase()}
                    </span>
                    {p.hostedInvoiceUrl && (
                      <a
                        href={p.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        Invoice
                      </a>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {p.createdAt.toLocaleString("en-CH")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        <Link href="/admin" className="text-primary hover:underline">
          ← Back to admin
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`break-all text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
