"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CreditCard,
  Loader2,
} from "lucide-react";
import { onboardingSchema, type OnboardingInput } from "@/lib/schemas";
import {
  PLAN_DETAILS,
  PLAN_ORDER,
  THEME_MODES,
  THEME_PRESETS,
} from "@/lib/constants";
import { startContainerCheckout } from "@/app/actions/containers";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label, FieldError } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STEPS = ["Basics", "Owner", "Appearance", "Subdomain", "Plan", "Review"] as const;

type SubdomainCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "error"; message: string };

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [subdomainCheck, setSubdomainCheck] = useState<SubdomainCheck>({ state: "idle" });

  const {
    register,
    watch,
    trigger,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: "",
      description: "",
      ownerMode: "same",
      ownerUsername: "",
      ownerEmail: "",
      ownerPassword: "",
      ownerPasswordConfirm: "",
      subdomain: "",
      themePreset: "coledia",
      themeMode: "system",
      plan: "starter",
    },
    mode: "onTouched",
  });

  const values = watch();
  const subdomain = watch("subdomain");
  const ownerMode = watch("ownerMode");

  // Debounced live availability check for the subdomain step.
  useEffect(() => {
    const candidate = subdomain?.toLowerCase() ?? "";
    if (!candidate || candidate.length < 3) {
      setSubdomainCheck({ state: "idle" });
      return;
    }
    setSubdomainCheck({ state: "checking" });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/subdomain-check?s=${encodeURIComponent(candidate)}`);
        const data = (await res.json()) as { available: boolean; reason?: string };
        setSubdomainCheck(
          data.available
            ? { state: "ok" }
            : { state: "error", message: data.reason ?? "Not available" },
        );
      } catch {
        setSubdomainCheck({ state: "idle" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [subdomain]);

  const stepFields = useMemo<(keyof OnboardingInput)[][]>(
    () => [
      ["name", "description"],
      ["ownerMode", "ownerUsername", "ownerEmail", "ownerPassword", "ownerPasswordConfirm"],
      ["themePreset", "themeMode"],
      ["subdomain"],
      ["plan"],
      [],
    ],
    [],
  );

  async function next() {
    const ok = await trigger(stepFields[step]);
    if (!ok) return;
    if (stepFields[step].includes("subdomain") && subdomainCheck.state === "error") return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(data: OnboardingInput) {
    setSubmitting(true);
    setSubmitError(null);
    const result = await startContainerCheckout(data);
    setSubmitting(false);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    if (result.url) {
      // Redirect to Stripe Checkout
      window.location.href = result.url;
      return;
    }
    setSubmitError("Unexpected response — please try again.");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      {/* Stepper */}
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1.5 rounded-full",
                i <= step ? "bg-primary" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "text-xs",
                i === step ? "font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* ── Step 1: Basics ─────────────────────────────────── */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Tell us about your community</h2>
              <p className="text-sm text-muted-foreground">
                Basic information for your new Coledia container.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Container name</Label>
              <Input
                id="name"
                placeholder="e.g. FC Example Sport Club"
                {...register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="What is this community about?"
                {...register("description")}
              />
              <FieldError message={errors.description?.message} />
            </div>
          </div>
        )}

        {/* ── Step 2: Owner ──────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Who owns the app?</h2>
              <p className="text-sm text-muted-foreground">
                This person becomes the owner account inside your Coledia app.
                They&apos;ll verify their email on the app when it goes live.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted",
                  ownerMode === "same" && "border-primary ring-2 ring-ring",
                )}
              >
                <input
                  type="radio"
                  value="same"
                  className="mt-1"
                  {...register("ownerMode")}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Use my Controlcenter account
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Your name and email will be used. You set the app password on
                    first login via a verification email.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted",
                  ownerMode === "custom" && "border-primary ring-2 ring-ring",
                )}
              >
                <input
                  type="radio"
                  value="custom"
                  className="mt-1"
                  {...register("ownerMode")}
                />
                <span>
                  <span className="block text-sm font-medium">
                    A different owner
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Create the owner account for someone else — they verify their
                    email on the app and can change the password afterwards.
                  </span>
                </span>
              </label>
            </div>

            {ownerMode === "custom" && (
              <div className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ownerUsername">Username</Label>
                  <Input
                    id="ownerUsername"
                    placeholder="club-admin"
                    autoComplete="off"
                    {...register("ownerUsername")}
                  />
                  <FieldError message={errors.ownerUsername?.message} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ownerEmail">Owner email</Label>
                  <Input
                    id="ownerEmail"
                    type="email"
                    placeholder="owner@example.com"
                    autoComplete="off"
                    {...register("ownerEmail")}
                  />
                  <FieldError message={errors.ownerEmail?.message} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ownerPassword">Password</Label>
                    <Input
                      id="ownerPassword"
                      type="password"
                      autoComplete="new-password"
                      {...register("ownerPassword")}
                    />
                    <FieldError message={errors.ownerPassword?.message} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ownerPasswordConfirm">Confirm password</Label>
                    <Input
                      id="ownerPasswordConfirm"
                      type="password"
                      autoComplete="new-password"
                      {...register("ownerPasswordConfirm")}
                    />
                    <FieldError message={errors.ownerPasswordConfirm?.message} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Appearance ─────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Choose your look</h2>
              <p className="text-sm text-muted-foreground">
                You can fine-tune colors and logos later inside the app.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Color theme</Label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {THEME_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() => setValue("themePreset", preset.id, { shouldDirty: true })}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                      values.themePreset === preset.id && "border-primary ring-2 ring-ring",
                    )}
                  >
                    <span
                      className="size-6 shrink-0 rounded-full"
                      style={{ backgroundColor: preset.primary }}
                    />
                    <span className="text-sm font-medium">{preset.name}</span>
                    {values.themePreset === preset.id && (
                      <Check className="ml-auto size-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
              <FieldError message={errors.themePreset?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="themeMode">Default mode</Label>
              <select id="themeMode" className={selectClass} {...register("themeMode")}>
                {THEME_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
              <FieldError message={errors.themeMode?.message} />
            </div>
          </div>
        )}

        {/* ── Step 4: Subdomain ──────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Claim your address</h2>
              <p className="text-sm text-muted-foreground">
                Your community will live at this address.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subdomain">Subdomain</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="subdomain"
                  placeholder="my-club"
                  className="max-w-xs"
                  {...register("subdomain")}
                  onChange={(e) => {
                    setValue("subdomain", e.target.value.toLowerCase(), {
                      shouldValidate: true,
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  .{process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "coledia.app"}
                </span>
              </div>
              <FieldError message={errors.subdomain?.message} />
              {!errors.subdomain && subdomainCheck.state === "checking" && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Checking availability…
                </p>
              )}
              {!errors.subdomain && subdomainCheck.state === "ok" && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="size-3.5" /> Available
                </p>
              )}
              {!errors.subdomain && subdomainCheck.state === "error" && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <CircleAlert className="size-3.5" /> {subdomainCheck.message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 5: Plan ───────────────────────────────────── */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Pick your plan</h2>
              <p className="text-sm text-muted-foreground">
                One subscription per container. Change or cancel anytime.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLAN_ORDER.map((plan) => {
                const details = PLAN_DETAILS[plan];
                const selected = values.plan === plan;
                return (
                  <button
                    type="button"
                    key={plan}
                    onClick={() => setValue("plan", plan, { shouldDirty: true })}
                    className={cn(
                      "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-muted",
                      selected && "border-primary ring-2 ring-ring",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{details.name}</span>
                      {selected && <Check className="size-4 text-primary" />}
                    </div>
                    <span className="text-2xl font-bold">
                      CHF {details.priceChf}
                      <span className="text-xs font-normal text-muted-foreground"> /mo</span>
                    </span>
                    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {details.features.slice(0, 4).map((f) => (
                        <li key={f}>· {f}</li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            <FieldError message={errors.plan?.message} />
          </div>
        )}

        {/* ── Step 6: Review ─────────────────────────────────── */}
        {step === 5 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Review &amp; create</h2>
              <p className="text-sm text-muted-foreground">
                You&apos;ll be redirected to Stripe to complete the payment. Your
                container is prepared right after.
              </p>
            </div>
            <dl className="divide-y rounded-xl border">
              <ReviewRow label="Name" value={values.name} />
              <ReviewRow label="Description" value={values.description || "—"} />
              <ReviewRow
                label="App owner"
                value={
                  values.ownerMode === "custom"
                    ? `${values.ownerUsername} <${values.ownerEmail}>`
                    : "Your Controlcenter account"
                }
              />
              <ReviewRow
                label="Address"
                value={`${values.subdomain}.${process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "coledia.app"}`}
              />
              <ReviewRow
                label="Theme"
                value={`${THEME_PRESETS.find((t) => t.id === values.themePreset)?.name ?? values.themePreset} (${values.themeMode})`}
              />
              <ReviewRow
                label="Plan"
                value={`${PLAN_DETAILS[values.plan].name} — CHF ${PLAN_DETAILS[values.plan].priceChf}/month`}
              />
            </dl>
            {submitError && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <CircleAlert className="size-4" /> {submitError}
              </p>
            )}
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 0 ? () => router.push("/dashboard") : back}
            disabled={submitting}
          >
            <ArrowLeft />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
              <ArrowRight />
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" /> Preparing checkout…
                </>
              ) : (
                <>
                  <CreditCard /> Pay &amp; create container
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
