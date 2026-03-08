import { requirePageSession } from "@/lib/auth/request";
import InstancesPageClient from "./instances-page-client";

export default async function InstancesPage() {
  await requirePageSession();
  return <InstancesPageClient />;
}
