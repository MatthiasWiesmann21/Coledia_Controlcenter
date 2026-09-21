import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Ban, CheckCircle2, Clock, FileEdit } from "lucide-react";
import { CONTAINER_STATUS_LABELS, type ContainerStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-muted text-muted-foreground",
        success: "border-transparent bg-success/10 text-success",
        warning: "border-transparent bg-warning/10 text-warning",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Map container status → badge variant */
export function statusBadgeVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "active":
    case "succeeded":
      return "success";
    case "pending_provisioning":
    case "seeding":
    case "pending":
      return "warning";
    case "pending_payment":
      return "warning";
    case "suspended":
    case "cancelled":
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
}

/** Map container status → badge icon */
function statusBadgeIcon(status: string): React.ReactNode {
  const cls = "size-3";
  switch (status) {
    case "pending_payment":
    case "seeding":
    case "pending_provisioning":
      return <Clock className={cls} />;
    case "active":
      return <CheckCircle2 className={cls} />;
    case "suspended":
    case "cancelled":
      return <Ban className={cls} />;
    case "draft":
      return <FileEdit className={cls} />;
    default:
      return null;
  }
}

/** Status badge with icon + label for container lifecycle states. */
export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const label = CONTAINER_STATUS_LABELS[status as ContainerStatus] ?? status;
  const icon = statusBadgeIcon(status);
  return (
    <Badge variant={statusBadgeVariant(status)} className={cn("gap-1", className)}>
      {icon}
      {label}
    </Badge>
  );
}
