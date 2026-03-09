import { withApiAuth } from "@/lib/auth/request";
import { getAppUpdateStatus } from "@/lib/services/update-service";
import { error, success } from "@/lib/utils/api-response";

export const GET = withApiAuth(async () => {
  try {
    const status = await getAppUpdateStatus();
    return success(status);
  } catch {
    return error("Failed to check for updates");
  }
}, { requireCsrf: false });
