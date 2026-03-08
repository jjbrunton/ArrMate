import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { getPageSession } from "@/lib/auth/request";
import { getAuthConfigurationStatus } from "@/lib/services/auth-service";

export default async function OnboardingPage() {
  const status = getAuthConfigurationStatus();

  if (status.configured) {
    const session = await getPageSession();
    redirect(session ? "/dashboard" : "/login");
  }

  return (
    <OnboardingForm
      canSubmit={status.canSetInitialAdmin}
      configurationMessage={status.canSetInitialAdmin ? undefined : status.message}
    />
  );
}
