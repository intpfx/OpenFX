import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const deleteAdminSessionHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().adminSession.delete(req);

export default defineEventHandler(async (event) =>
  await deleteAdminSessionHandler(await createWebRequest(event, "DELETE"))
);
