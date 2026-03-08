import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getRunningJobs } from "@/lib/scheduler/job-tracker";
import { success } from "@/lib/utils/api-response";

export const GET = withApiAuth(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const running = getRunningJobs(Number(id));

  return success({
    running,
    busy: running.length > 0,
  });
}, { requireCsrf: false });
