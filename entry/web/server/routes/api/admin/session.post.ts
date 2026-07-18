import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const createAdminSessionHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().adminSession.create(req);

export default defineEventHandler(async (event) =>
  await createAdminSessionHandler(await createWebRequest(event, "POST"))
);
