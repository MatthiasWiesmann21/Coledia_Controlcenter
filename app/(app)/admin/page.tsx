import type { Metadata } from "next";
import Link from "next/link";
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
  CONTAINER_STATUS_LABELS,
  type ContainerStatus,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();

  const [customers, containers, failedPayments] = await Promise.all([
    prisma.user.findMany({
      where: { role: "customer" },
      include: { _count: { select: { containers: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.container.findMany({
      include: { user: { select: { email: true, name: true } }, subscription: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.payment.findMany({
      where: { status: "failed" },
      include: { container: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const provisioningCount = containers.filter(
    (c) => c.status === "pending_provisioning" || c.status === "seeding",
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          {customers.length} customers · {containers.length} containers
          {provisioningCount > 0 && (
            <span className="text-warning"> · {provisioningCount} waiting for provisioning</span>
          )}
        </p>
      </div>

      {/* Containers */}
      <Card>
        <CardHeader>
          <CardTitle>Containers</CardTitle>
          <CardDescription>Newest first. Click a row for details &amp; actions.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Subdomain</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/containers/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{c.user.email}</td>
                  <td className="px-6 py-3">{c.plan}</td>
                  <td className="px-6 py-3">
                    <Badge variant={statusBadgeVariant(c.status)}>
                      {CONTAINER_STATUS_LABELS[c.status as ContainerStatus] ?? c.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs">{c.subdomain}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {c.createdAt.toLocaleDateString("en-CH")}
                  </td>
                </tr>
              ))}
              {containers.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-muted-foreground" colSpan={6}>
                    No containers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Customers */}
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Containers</th>
                <th className="px-6 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-6 py-3 font-medium">{u.name ?? "—"}</td>
                  <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-6 py-3">{u._count.containers}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {u.createdAt.toLocaleDateString("en-CH")}
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-muted-foreground" colSpan={4}>
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Failed payments */}
      <Card>
        <CardHeader>
          <CardTitle>Failed payments</CardTitle>
          <CardDescription>Latest failed invoices from Stripe.</CardDescription>
        </CardHeader>
        <CardContent>
          {failedPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No failed payments.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {failedPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4">
                  <span>
                    <Link
                      href={`/admin/containers/${p.container.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.container.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      — {p.amount.toString()} {p.currency.toUpperCase()}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.createdAt.toLocaleString("en-CH")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
