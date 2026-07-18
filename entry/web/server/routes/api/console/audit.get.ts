import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const consoleAuditHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.audit(req);

export default defineEventHandler(async (event) =>
  await consoleAuditHandler(await createWebRequest(event))
);
