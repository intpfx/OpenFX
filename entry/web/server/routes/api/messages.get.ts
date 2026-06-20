import { defineEventHandler } from "h3";

import { getAdminUnlockKey } from "../../admin/unlocks.ts";
import { listHomepageMessages } from "../../messages.ts";
import { createWebRequest } from "../../utils/request.ts";

const isAuthorized = (req: Request): boolean => {
  const configured = getAdminUnlockKey();
  const provided = (req.headers.get("x-openfx-admin-key") ?? "").trim();
  return !!configured && provided === configured;
};

const parseLimit = (req: Request) => {
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isFinite(rawLimit)) {
    return 20;
  }

  return Math.min(Math.max(Math.trunc(rawLimit), 1), 50);
};

export const listHomepageMessagesHandler = async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const messages = await listHomepageMessages(parseLimit(req));
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
