import { z } from "zod";
import {
  OWNER_MODES,
  PLANS,
  RESERVED_SUBDOMAINS,
  THEME_PRESETS,
  THEME_MODES,
} from "./constants";

// ─── Subdomain ───────────────────────────────────────────────────
export const subdomainSchema = z
  .string()
  .min(3, "At least 3 characters")
  .max(32, "At most 32 characters")
  .regex(/^[a-z0-9](-?[a-z0-9])*$/, "Lowercase letters, numbers and single dashes only")
  .refine((v) => !RESERVED_SUBDOMAINS.includes(v), {
    message: "This subdomain is reserved",
  });

// ─── Onboarding ──────────────────────────────────────────────────
const themePresetIds = THEME_PRESETS.map((t) => t.id) as [
  (typeof THEME_PRESETS)[number]["id"],
  ...(typeof THEME_PRESETS)[number]["id"][],
];

export const onboardingSchema = z
  .object({
    name: z.string().min(2, "At least 2 characters").max(80),
    description: z.string().max(500).optional().or(z.literal("")),
    // The selected plan IS the container type — sent to the app (Tenant.plan)
    // and billed via Stripe. There is no separate marketing-only "type" field.
    plan: z.enum([PLANS.STARTER, PLANS.CLUB, PLANS.ORGANIZATION]),

    // App owner: either the Controlcenter account itself ("same") or a
    // different person ("custom" → username/email/password fields required).
    ownerMode: z.enum([OWNER_MODES.SAME, OWNER_MODES.CUSTOM]),
    ownerUsername: z
      .string()
      .min(3, "At least 3 characters")
      .max(32, "At most 32 characters")
      .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dots, dashes, underscores only")
      .optional()
      .or(z.literal("")),
    ownerEmail: z.string().email("Enter a valid email address").optional().or(z.literal("")),
    ownerPassword: z.string().min(8, "At least 8 characters").optional().or(z.literal("")),
    ownerPasswordConfirm: z.string().optional().or(z.literal("")),

    subdomain: subdomainSchema,
    themePreset: z.enum(themePresetIds),
    themeMode: z.enum(THEME_MODES),
  })
  .superRefine((data, ctx) => {
    if (data.ownerMode !== OWNER_MODES.CUSTOM) return;
    if (!data.ownerUsername) {
      ctx.addIssue({ code: "custom", path: ["ownerUsername"], message: "Username is required" });
    }
    if (!data.ownerEmail) {
      ctx.addIssue({ code: "custom", path: ["ownerEmail"], message: "Email is required" });
    }
    if (!data.ownerPassword) {
      ctx.addIssue({ code: "custom", path: ["ownerPassword"], message: "Password is required" });
    }
    if (data.ownerPassword && data.ownerPassword !== data.ownerPasswordConfirm) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerPasswordConfirm"],
        message: "Passwords do not match",
      });
    }
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;

// ─── Container edit (detail page) ────────────────────────────────
export const containerUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  subdomain: subdomainSchema.optional(),
  themePreset: z.enum(themePresetIds).optional(),
  themeMode: z.enum(THEME_MODES).optional(),
});

export type ContainerUpdateInput = z.infer<typeof containerUpdateSchema>;
