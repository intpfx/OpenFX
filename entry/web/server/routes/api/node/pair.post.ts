import { defineEventHandler } from "h3";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const pairNodeHandler = (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => plane.node.pair(req);

export default defineEventHandler(async (event) =>
  await pairNodeHandler(await createWebRequest(event, "POST"))
);
