import { defineEventHandler } from "h3";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const nodeHeartbeatHandler = (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => plane.node.heartbeat(req);

export default defineEventHandler(async (event) =>
  await nodeHeartbeatHandler(await createWebRequest(event, "POST"))
);
