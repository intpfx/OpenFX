import { defineEventHandler } from "h3";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const createPairingHandler = (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => plane.pairings.create(req);

export default defineEventHandler(async (event) =>
  await createPairingHandler(await createWebRequest(event, "POST"))
);
