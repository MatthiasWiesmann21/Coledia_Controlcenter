import { z } from "zod";
import {
  CONTAINER_TYPES,
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

export const onboardingSchema = z.object({
  name: z.string().min(2, "At least 2 characters").max(80),
  description: z.string().max(500).optional().or(z.literal("")),
  type: z.enum([
    CONTAINER_TYPES.CLUB,
    CONTAINER_TYPES.ASSOCIATION,
    CONTAINER_TYPES.TEAM,
    CONTAINER_TYPES.COMPANY,
    CONTAINER_TYPES.OTHER,
  ]),
  subdomain: subdomainSchema,
  themePreset: z.enum(themePresetIds),
  themeMode: z.enum(THEME_MODES),
  plan: z.enum([PLANS.STARTER, PLANS.CLUB, PLANS.ORGANIZATION]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

// ─── Container edit (detail page) ────────────────────────────────
export const containerUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  type: onboardingSchema.shape.type.optional(),
  subdomain: subdomainSchema.optional(),
  themePreset: z.enum(themePresetIds).optional(),
  themeMode: z.enum(THEME_MODES).optional(),
});

export type ContainerUpdateInput = z.infer<typeof containerUpdateSchema>;
