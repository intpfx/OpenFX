import { defineEventHandler } from "h3";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const nodeTelemetryHandler = (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => plane.node.telemetry(req);

export default defineEventHandler(async (event) =>
  await nodeTelemetryHandler(await createWebRequest(event, "POST"))
);
