import { withApiAuth } from "@/lib/auth/request";
import { getDashboardStats } from "@/lib/services/issue-service";
import { success } from "@/lib/utils/api-response";

export const GET = withApiAuth(async () => {
  const stats = getDashboardStats();
  return success({ status: "ok", ...stats });
}, { requireCsrf: false });
