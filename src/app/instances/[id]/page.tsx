import { requirePageSession } from "@/lib/auth/request";
import InstanceDetailPageClient from "./instance-detail-page-client";

export default async function InstanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession();
  return <InstanceDetailPageClient params={params} />;
}
