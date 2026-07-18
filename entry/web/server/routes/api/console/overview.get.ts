import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const consoleOverviewHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.handle(req, "overview");

export default defineEventHandler(async (event) =>
  await consoleOverviewHandler(await createWebRequest(event))
);
