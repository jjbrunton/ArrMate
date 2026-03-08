import { requirePageSession } from "@/lib/auth/request";
import DashboardPageClient from "./dashboard-page-client";

export default async function DashboardPage() {
  await requirePageSession();
  return <DashboardPageClient />;
}
