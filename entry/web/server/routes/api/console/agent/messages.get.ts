import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../../console/control-plane.ts";
import { createWebRequest } from "../../../../utils/request.ts";

export const consoleAgentMessagesHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.handle(req, "agent.messages.get");

export default defineEventHandler(async (event) =>
  await consoleAgentMessagesHandler(await createWebRequest(event))
);
