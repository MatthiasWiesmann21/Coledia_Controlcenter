"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const profileSchema = z.object({
  name: z.string().min(2, "At least 2 characters").max(80),
});
type ProfileValues = z.infer<typeof profileSchema>;

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type EmailValues = z.infer<typeof emailSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type PasswordValues = z.infer<typeof passwordSchema>;

export function ProfileSettings({
  initialName,
  initialEmail,
}: {
  initialName: string;
  initialEmail: string;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: initialName },
  });
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: initialEmail },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onProfileSubmit(values: ProfileValues) {
    setProfileMsg(null);
    setProfileErr(null);
    const { error } = await authClient.updateUser({ name: values.name });
    if (error) {
      setProfileErr(error.message ?? "Could not update the profile");
      return;
    }
    setProfileMsg("Profile updated");
    router.refresh();
  }

  async function onEmailSubmit(values: EmailValues) {
    setEmailMsg(null);
    setEmailErr(null);
    const { error } = await authClient.changeEmail({
      newEmail: values.email,
      callbackURL: "/profile",
    });
    if (error) {
      setEmailErr(error.message ?? "Could not change the email");
      return;
    }
    setEmailMsg("Check your new inbox — we sent a verification link to confirm the change.");
  }

  async function onPasswordSubmit(values: PasswordValues) {
    setPwMsg(null);
    setPwErr(null);
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      setPwErr(error.message ?? "Could not change the password");
      return;
    }
    setPwMsg("Password updated");
    passwordForm.reset();
  }

  const selectClass =
    "flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name as shown in the Controlcenter</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={profileForm.handleSubmit(onProfileSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" className="max-w-xs" {...profileForm.register("name")} />
              <FieldError message={profileForm.formState.errors.name?.message} />
            </div>
            {profileMsg && <p className="text-sm text-success">{profileMsg}</p>}
            {profileErr && <FieldError message={profileErr} />}
            <div>
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                {profileForm.formState.isSubmitting ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            You&apos;ll get a verification link at the new address — the change
            applies once it&apos;s confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={emailForm.handleSubmit(onEmailSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                className="max-w-xs"
                {...emailForm.register("email")}
              />
              <FieldError message={emailForm.formState.errors.email?.message} />
            </div>
            {emailMsg && <p className="text-sm text-success">{emailMsg}</p>}
            {emailErr && <FieldError message={emailErr} />}
            <div>
              <Button type="submit" disabled={emailForm.formState.isSubmitting}>
                {emailForm.formState.isSubmitting ? "Sending…" : "Change email"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changes the password of your Controlcenter account. Other sessions are
            signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                className="max-w-xs"
                {...passwordForm.register("currentPassword")}
              />
              <FieldError
                message={passwordForm.formState.errors.currentPassword?.message}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register("newPassword")}
                />
                <FieldError
                  message={passwordForm.formState.errors.newPassword?.message}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register("confirmPassword")}
                />
                <FieldError
                  message={passwordForm.formState.errors.confirmPassword?.message}
                />
              </div>
            </div>
            {pwMsg && <p className="text-sm text-success">{pwMsg}</p>}
            {pwErr && <FieldError message={pwErr} />}
            <div>
              <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                {passwordForm.formState.isSubmitting ? "Updating…" : "Change password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme of the Controlcenter interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="theme">Theme</Label>
            <select
              id="theme"
              className={selectClass}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
