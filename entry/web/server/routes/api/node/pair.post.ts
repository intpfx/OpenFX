import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const pairNodeHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().node.pair(req);

export default defineEventHandler(async (event) =>
  await pairNodeHandler(await createWebRequest(event, "POST"))
);
