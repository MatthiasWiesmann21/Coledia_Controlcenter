import type { Metadata } from "next";
import { requireVerifiedUser } from "@/lib/session";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = { title: "New container" };

export default async function OnboardingPage() {
  await requireVerifiedUser("/onboarding");
  return <OnboardingWizard />;
}
