import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const nodeTelemetryHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().node.telemetry(req);

export default defineEventHandler(async (event) =>
  await nodeTelemetryHandler(await createWebRequest(event, "POST"))
);
