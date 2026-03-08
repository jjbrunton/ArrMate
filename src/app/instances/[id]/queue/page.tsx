import { requirePageSession } from "@/lib/auth/request";
import QueuePageClient from "./queue-page-client";

export default async function QueuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession();
  return <QueuePageClient params={params} />;
}
