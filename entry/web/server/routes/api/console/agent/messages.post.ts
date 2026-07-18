import { defineEventHandler } from "h3";
import { getConsoleControlPlane } from "../../../../console/control-plane.ts";
import { createWebRequest } from "../../../../utils/request.ts";

export const postConsoleAgentMessageHandler = (req: Request): Promise<Response> =>
  getConsoleControlPlane().console.handle(req, "agent.messages.post");

export default defineEventHandler(async (event) =>
  await postConsoleAgentMessageHandler(await createWebRequest(event, "POST"))
);
