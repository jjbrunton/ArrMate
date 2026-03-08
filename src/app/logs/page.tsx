import { requirePageSession } from "@/lib/auth/request";
import LogsPageClient from "./logs-page-client";

export default async function LogsPage() {
  await requirePageSession();
  return <LogsPageClient />;
}
