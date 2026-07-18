import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const consoleTelemetryHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.telemetry(req);

export default defineEventHandler(async (event) =>
  await consoleTelemetryHandler(await createWebRequest(event))
);
