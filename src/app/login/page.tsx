import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getPageSession } from "@/lib/auth/request";
import { getAuthConfigurationStatus } from "@/lib/services/auth-service";

export default async function LoginPage() {
  const status = getAuthConfigurationStatus();

  if (!status.configured) {
    redirect("/onboarding");
  }

  const session = await getPageSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <LoginForm
      configured={status.configured}
      configurationMessage={status.message}
    />
  );
}
