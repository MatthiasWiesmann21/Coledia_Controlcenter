import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireVerifiedUser } from "@/lib/session";
import { ProfileSettings } from "@/components/profile/profile-settings";
import { ManageBillingButton } from "@/components/containers/billing-actions";
import { Badge, statusBadgeVariant } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireVerifiedUser();

  const containers = await prisma.container.findMany({
    where: { userId: session.user.id },
    include: { subscription: true, payments: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  const billable = containers.filter((c) => c.subscription?.stripeCustomerId);
  const payments = containers.flatMap((c) =>
    c.payments.map((p) => ({ ...p, containerName: c.name })),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, appearance, and billing receipts.
        </p>
      </div>

      <ProfileSettings
        initialName={session.user.name ?? ""}
        initialEmail={session.user.email}
      />

      {/* Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>
            One Stripe subscription per container — manage payment methods,
            invoices, and cancellations in the Stripe billing portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No paid containers yet — receipts appear after your first checkout.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {billable.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/containers/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <Badge variant={statusBadgeVariant(c.subscription!.status)}>
                      {c.subscription!.status}
                    </Badge>
                  </div>
                  <ManageBillingButton containerId={c.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Receipts */}
      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
          <CardDescription>Your invoices across all containers.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex flex-col">
                    <span className="font-medium">{p.containerName}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.createdAt.toLocaleDateString("en-CH")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>
                      {String(p.amount)} {p.currency.toUpperCase()}
                    </span>
                    <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
