/**
 * Coledia Controlcenter — shared constants.
 * Mirrored from @coledia/shared + coledia_website pricing (no shared package
 * across repos). Source of truth for plans, themes, container types.
 */

// ─── Pricing plans ───────────────────────────────────────────────
export const PLANS = {
  STARTER: "starter",
  CLUB: "club",
  ORGANIZATION: "organization",
} as const;

export type Plan = (typeof PLANS)[keyof typeof PLANS];

export const PLAN_ORDER: Plan[] = [PLANS.STARTER, PLANS.CLUB, PLANS.ORGANIZATION];

export const PLAN_DETAILS: Record<Plan, {
  name: string;
  priceChf: number;
  memberLimit: number | null; // null = unlimited
  storageLimitBytes: number | null;
  features: string[];
}> = {
  starter: {
    name: "Starter",
    priceChf: 9,
    memberLimit: 50,
    storageLimitBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    features: [
      "Up to 50 members",
      "1 GB storage",
      "Custom branding",
      "Courses, news & events",
      "Community chat",
    ],
  },
  club: {
    name: "Club",
    priceChf: 29,
    memberLimit: 250,
    storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    features: [
      "Up to 250 members",
      "10 GB storage",
      "Quizzes & certificates",
      "Live events & user groups",
      "Sell courses (Stripe Connect)",
      "Audit logs",
    ],
  },
  organization: {
    name: "Organization",
    priceChf: 99,
    memberLimit: null,
    storageLimitBytes: null,
    features: [
      "Unlimited members",
      "Unlimited storage",
      "API access & webhooks",
      "Custom pages",
      "White label",
      "Everything in Club",
    ],
  },
};

// ─── Container types (marketing info only — not used by the app) ──
export const CONTAINER_TYPES = {
  CLUB: "club",
  ASSOCIATION: "association",
  TEAM: "team",
  COMPANY: "company",
  OTHER: "other",
} as const;

export type ContainerType = (typeof CONTAINER_TYPES)[keyof typeof CONTAINER_TYPES];

export const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  club: "Club",
  association: "Association",
  team: "Team",
  company: "Company",
  other: "Other",
};

// ─── Theme presets (must match the app's Branding.themePreset) ────
export const THEME_PRESETS = [
  { id: "coledia", name: "Coledia", primary: "#008080" },
  { id: "ocean", name: "Ocean", primary: "#0e6ba8" },
  { id: "forest", name: "Forest", primary: "#2d6a4f" },
  { id: "midnight", name: "Midnight", primary: "#3d5a99" },
  { id: "sunset", name: "Sunset", primary: "#e76f51" },
  { id: "rose", name: "Rose", primary: "#c2255c" },
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number]["id"];

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

// ─── Container lifecycle status ──────────────────────────────────
export const CONTAINER_STATUS = {
  DRAFT: "draft",
  PENDING_PAYMENT: "pending_payment",
  SEEDING: "seeding",
  PENDING_PROVISIONING: "pending_provisioning",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
} as const;

export type ContainerStatus = (typeof CONTAINER_STATUS)[keyof typeof CONTAINER_STATUS];

export const CONTAINER_STATUS_LABELS: Record<ContainerStatus, string> = {
  draft: "Draft",
  pending_payment: "Awaiting payment",
  seeding: "Seeding",
  pending_provisioning: "Provisioning",
  active: "Active",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

// ─── Roles ───────────────────────────────────────────────────────
export const USER_ROLES = { CUSTOMER: "customer", ADMIN: "admin" } as const;
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// ─── Reserved subdomains ─────────────────────────────────────────
export const RESERVED_SUBDOMAINS = [
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "docs",
  "blog",
  "help",
  "support",
  "staging",
  "demo",
  "coledia",
  "controlcenter",
  "billing",
  "dashboard",
  "status",
];

// ─── Misc ────────────────────────────────────────────────────────
export function appUrlForSubdomain(subdomain: string): string {
  const base = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "coledia.app";
  return `https://${subdomain}.${base}`;
}
