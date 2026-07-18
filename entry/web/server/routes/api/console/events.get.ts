import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const consoleEventsHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().events.stream(req);

export default defineEventHandler(async (event) =>
  await consoleEventsHandler(await createWebRequest(event))
);
