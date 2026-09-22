"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label, FieldError } from "@/components/ui/label";
import { updateContainer } from "@/app/actions/containers";
import { THEME_MODES, THEME_PRESETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const editSchema = z.object({
  name: z.string().min(2, "At least 2 characters").max(80),
  description: z.string().max(500).optional().or(z.literal("")),
  themePreset: z.string(),
  themeMode: z.enum(THEME_MODES),
});
type EditValues = z.infer<typeof editSchema>;

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export interface ContainerEditDefaults {
  id: string;
  name: string;
  description: string | null;
  themePreset: string;
  themeMode: string | null;
}

export function EditContainerForm({ container }: { container: ContainerEditDefaults }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: container.name,
      description: container.description ?? "",
      themePreset: container.themePreset,
      themeMode: (container.themeMode as EditValues["themeMode"]) ?? "system",
    },
  });

  const themePreset = useWatch({ control, name: "themePreset" });

  async function onSubmit(values: EditValues) {
    setError(null);
    setSaved(false);
    const result = await updateContainer(container.id, values);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-name">Name</Label>
        <Input id="edit-name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea id="edit-description" {...register("description")} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-themeMode">Default mode</Label>
          <select id="edit-themeMode" className={selectClass} {...register("themeMode")}>
            {THEME_MODES.map((m) => (
              <option key={m} value={m}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Color theme</Label>
        <div className="grid grid-cols-3 gap-2">
          {THEME_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => setValue("themePreset", preset.id, { shouldDirty: true })}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-medium transition-colors hover:bg-muted",
                themePreset === preset.id && "border-primary ring-2 ring-ring",
              )}
            >
              <span
                className="size-4 shrink-0 rounded-full"
                style={{ backgroundColor: preset.primary }}
              />
              {preset.name}
            </button>
          ))}
        </div>
      </div>
      {error && <FieldError message={error} />}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" /> Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  );
}
