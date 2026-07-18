import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const createPairingHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().pairings.create(req);

export default defineEventHandler(async (event) =>
  await createPairingHandler(await createWebRequest(event, "POST"))
);
