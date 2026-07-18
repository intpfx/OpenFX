import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const getAdminSessionHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().adminSession.get(req);

export default defineEventHandler(async (event) =>
  await getAdminSessionHandler(await createWebRequest(event))
);
