import { defineEventHandler } from "h3";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const deleteAdminSessionHandler = (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => plane.adminSession.delete(req);

export default defineEventHandler(async (event) =>
  await deleteAdminSessionHandler(await createWebRequest(event, "DELETE"))
);
