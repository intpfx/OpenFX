import { defineEventHandler } from "h3";

import {
  getHomepageMessageClientIp,
  HomepageMessageInputError,
  HomepageMessageRateLimitError,
  MESSAGE_BODY_MAX_BYTES,
  saveHomepageMessage,
} from "../../messages.ts";
import { createWebRequest } from "../../utils/request.ts";

const readMessageBody = async (req: Request): Promise<unknown> => {
  const rawContentLength = req.headers.get("content-length");
  const contentLength = rawContentLength === null ? 0 : Number(rawContentLength);
  if (Number.isFinite(contentLength) && contentLength > MESSAGE_BODY_MAX_BYTES) {
    throw new HomepageMessageInputError("body_too_large", 413);
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MESSAGE_BODY_MAX_BYTES) {
    throw new HomepageMessageInputError("body_too_large", 413);
  }

  return JSON.parse(rawBody) as unknown;
};

export const saveHomepageMessageHandler = async (req: Request): Promise<Response> => {
  let body: unknown;
  try {
    body = await readMessageBody(req);
  } catch (error) {
    if (error instanceof HomepageMessageInputError) {
      return Response.json(
        { ok: false, error: error.code },
        { status: error.status },
      );
    }

    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const message = await saveHomepageMessage({
      ...(body as Record<string, unknown>),
      clientIp: getHomepageMessageClientIp(req),
    });
    return Response.json({ ok: true, message });
  } catch (error) {
    if (error instanceof HomepageMessageInputError) {
      return Response.json(
        { ok: false, error: error.code },
        { status: error.status },
      );
    }

    if (error instanceof HomepageMessageRateLimitError) {
      return Response.json({
        ok: false,
        error: "daily_message_limit",
        hint: "每天每个 IP 最多发送 3 条 MESSAGE",
      }, { status: 429 });
    }

    return Response.json({
      ok: false,
      error: "kv_unavailable",
      hint: "当前运行时不可用 Deno KV",
    }, { status: 503 });
  }
};

export default defineEventHandler(async (event) => {
  return await saveHomepageMessageHandler(await createWebRequest(event, "POST"));
});
