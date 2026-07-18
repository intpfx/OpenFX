import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const nodeHeartbeatHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().node.heartbeat(req);

export default defineEventHandler(async (event) =>
  await nodeHeartbeatHandler(await createWebRequest(event, "POST"))
);
