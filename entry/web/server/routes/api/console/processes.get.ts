import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const consoleProcessesHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.handle(req, "processes");

export default defineEventHandler(async (event) =>
  await consoleProcessesHandler(await createWebRequest(event))
);
