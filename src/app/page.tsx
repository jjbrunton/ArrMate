import { getPageSession } from "@/lib/auth/request";
import { getAuthConfigurationStatus } from "@/lib/services/auth-service";
import { redirect } from "next/navigation";

export default async function Home() {
  const authStatus = getAuthConfigurationStatus();

  if (!authStatus.configured) {
    redirect("/onboarding");
  }

  const session = await getPageSession();
  redirect(session ? "/dashboard" : "/login");
}
