import { defineEventHandler } from "h3";

import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../console/control-plane.ts";
import { requireAdminSession } from "../../console/admin.ts";
import { listHomepageMessages } from "../../messages.ts";
import { createWebRequest } from "../../utils/request.ts";

const parseLimit = (req: Request) => {
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isFinite(rawLimit)) {
    return 20;
  }

  return Math.min(Math.max(Math.trunc(rawLimit), 1), 50);
};

export const listHomepageMessagesHandler = async (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
  listMessages: typeof listHomepageMessages = listHomepageMessages,
): Promise<Response> => {
  const denied = await requireAdminSession(req, plane);
  if (denied) return denied;

  try {
    const messages = await listMessages(parseLimit(req));
    return Response.json({ ok: true, messages });
  } catch {
    return Response.json({
      ok: false,
      error: "kv_unavailable",
      hint: "当前运行时不可用 Deno KV",
    }, { status: 503 });
  }
};

export default defineEventHandler(async (event) => {
  return await listHomepageMessagesHandler(await createWebRequest(event));
});
