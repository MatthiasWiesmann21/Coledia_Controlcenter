import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireVerifiedUser } from "@/lib/session";
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
  CONTAINER_TYPE_LABELS,
  PLAN_DETAILS,
  appUrlForSubdomain,
  type ContainerStatus,
  type ContainerType,
  type Plan,
} from "@/lib/constants";
import {
  DeleteUnpaidButton,
  ManageBillingButton,
  RestartSubscriptionButton,
  ResumePaymentButton,
} from "@/components/containers/billing-actions";
import { EditContainerForm } from "@/components/containers/edit-container-form";

export const metadata: Metadata = { title: "Container" };

export default async function ContainerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { id } = await params;
  const { checkout } = await searchParams;
  const session = await requireVerifiedUser(`/containers/${id}`);

  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      subscription: true,
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!container || container.userId !== session.user.id) notFound();

  const status = container.status as ContainerStatus;
  const plan = container.plan as Plan;
  const subscription = container.subscription;
  const appUrl = appUrlForSubdomain(container.subdomain);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{container.name}</h1>
            <Badge variant={statusBadgeVariant(status)}>
              {CONTAINER_STATUS_LABELS[status] ?? status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {status === CONTAINER_STATUS.ACTIVE ? (
              <a
                href={appUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {appUrl} <ExternalLink className="size-3.5" />
              </a>
            ) : (
              appUrl
            )}
          </p>
        </div>
      </div>

      {/* Banners */}
      {checkout === "success" && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm">
          Payment received. Your container is being prepared — you&apos;ll find it
          online shortly.
        </div>
      )}
      {checkout === "cancelled" && status === CONTAINER_STATUS.PENDING_PAYMENT && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          The checkout was cancelled — the container exists as a draft. Complete the
          payment whenever you&apos;re ready.
        </div>
      )}
      {status === CONTAINER_STATUS.PENDING_PAYMENT && (
        <Card>
          <CardHeader>
            <CardTitle>Payment required</CardTitle>
            <CardDescription>
              Your container will be created once the subscription is paid.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <ResumePaymentButton containerId={container.id} />
            <DeleteUnpaidButton containerId={container.id} />
          </CardContent>
        </Card>
      )}
      {status === CONTAINER_STATUS.SUSPENDED && (
        <Card>
          <CardHeader>
            <CardTitle>Container suspended</CardTitle>
            <CardDescription>
              {subscription?.status === "canceled"
                ? "Your subscription was canceled. Restart it to bring the container back online."
                : "This container was suspended. Contact support if you believe this is a mistake."}
            </CardDescription>
          </CardHeader>
          {subscription?.status === "canceled" && (
            <CardContent>
              <RestartSubscriptionButton containerId={container.id} />
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <Row label="Plan" value={PLAN_DETAILS[plan]?.name ?? container.plan} />
              <Row
                label="Type"
                value={CONTAINER_TYPE_LABELS[container.type as ContainerType] ?? container.type}
              />
              <Row
                label="Theme"
                value={`${container.themePreset} (${container.themeMode ?? "system"})`}
              />
              <Row
                label="Created"
                value={container.createdAt.toLocaleDateString("en-CH")}
              />
              {container.description && (
                <Row label="Description" value={container.description} />
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>One subscription per container.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="flex flex-col gap-3 text-sm">
              <Row
                label="Subscription"
                value={
                  subscription
                    ? `${subscription.status}${subscription.cancelAtPeriodEnd ? " (cancels at period end)" : ""}`
                    : "—"
                }
              />
              {subscription?.currentPeriodEnd && (
                <Row
                  label="Current period ends"
                  value={subscription.currentPeriodEnd.toLocaleDateString("en-CH")}
                />
              )}
            </dl>
            {subscription?.stripeCustomerId && status !== CONTAINER_STATUS.PENDING_PAYMENT && (
              <ManageBillingButton containerId={container.id} />
            )}
          </CardContent>
        </Card>

        {/* Edit */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Edit container</CardTitle>
            <CardDescription>
              Changes sync to your app automatically. To change the subdomain, contact
              support (it requires a domain remap).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditContainerForm
              container={{
                id: container.id,
                name: container.name,
                description: container.description,
                type: container.type,
                themePreset: container.themePreset,
                themeMode: container.themeMode,
              }}
            />
          </CardContent>
        </Card>

        {/* Events */}
        {container.events.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
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
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        <Link href="/dashboard" className="text-primary hover:underline">
          ← Back to containers
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
