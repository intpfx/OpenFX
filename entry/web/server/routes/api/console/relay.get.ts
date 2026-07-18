import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const getConsoleRelayHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.handle(req, "relay.settings.get");

export default defineEventHandler(async (event) =>
  await getConsoleRelayHandler(await createWebRequest(event))
);
