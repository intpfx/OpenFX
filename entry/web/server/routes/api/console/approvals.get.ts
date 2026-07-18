import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const consoleApprovalsHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.handle(req, "approvals");

export default defineEventHandler(async (event) =>
  await consoleApprovalsHandler(await createWebRequest(event))
);
