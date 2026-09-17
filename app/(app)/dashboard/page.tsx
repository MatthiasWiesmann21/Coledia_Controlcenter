import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireVerifiedUser } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";
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
  PLAN_DETAILS,
  appUrlForSubdomain,
} from "@/lib/constants";
import type { Plan, ContainerStatus } from "@/lib/constants";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "Containers" };

export default async function DashboardPage() {
  const session = await requireVerifiedUser();

  const containers = await prisma.container.findMany({
    where: { userId: session.user.id },
    include: { subscription: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your containers</h1>
          <p className="text-sm text-muted-foreground">
            One subscription per container — create as many as you need.
          </p>
        </div>
        <Link href="/onboarding" className={buttonVariants()}>
          <Plus />
          New container
        </Link>
      </div>

      {containers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No containers yet</CardTitle>
            <CardDescription>
              Create your first Coledia container — it only takes a few minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className={buttonVariants()}>
              <Plus />
              Create your first container
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {containers.map((c) => (
            <Link key={c.id} href={`/containers/${c.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      {c.status === "active"
                        ? appUrlForSubdomain(c.subdomain)
                        : `${c.subdomain} · ${PLAN_DETAILS[c.plan as Plan]?.name ?? c.plan}`}
                    </CardDescription>
                  </div>
                  <Badge variant={statusBadgeVariant(c.status)}>
                    {CONTAINER_STATUS_LABELS[c.status as ContainerStatus] ?? c.status}
                  </Badge>
                </CardHeader>
                {c.description && (
                  <CardContent>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {c.description}
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
