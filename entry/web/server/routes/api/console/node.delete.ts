import { defineEventHandler } from "h3";

import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const revokeConsoleNodeHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().node.revoke(req);

export default defineEventHandler(async (event) =>
  await revokeConsoleNodeHandler(await createWebRequest(event, "DELETE"))
);
