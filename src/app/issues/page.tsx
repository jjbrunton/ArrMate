import { requirePageSession } from "@/lib/auth/request";
import IssuesPageClient from "./issues-page-client";

export default async function IssuesPage() {
  await requirePageSession();
  return <IssuesPageClient />;
}
