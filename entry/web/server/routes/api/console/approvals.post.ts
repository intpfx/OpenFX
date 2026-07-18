import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const resolveConsoleApprovalHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.handle(req, "approvals.resolve");

export default defineEventHandler(async (event) =>
  await resolveConsoleApprovalHandler(await createWebRequest(event, "POST"))
);
