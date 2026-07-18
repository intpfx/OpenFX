import { defineEventHandler } from "h3";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const nodeEventsHandler = (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => plane.node.events(req);

export default defineEventHandler(async (event) =>
  await nodeEventsHandler(await createWebRequest(event, "POST"))
);
