import { expect } from "@std/expect";

import { getKv } from "../../../domains/_shared/kv.ts";
import {
  getHomepageMessageRateDay,
  hashHomepageMessageClientId,
  homepageMessageKey,
  homepageMessageRateKey,
} from "../server/messages.ts";
import { listHomepageMessagesHandler } from "../server/routes/api/messages.get.ts";
import { saveHomepageMessageHandler } from "../server/routes/api/messages.post.ts";

const createMessageRequest = (content: string, clientIp = "203.0.113.42") => {
  return new Request("http://localhost/api/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp,
    },
    body: JSON.stringify({ content }),
  });
};

const deleteMessageRateForIp = async (clientIp: string) => {
  const kv = await getKv();
  const clientHash = await hashHomepageMessageClientId(clientIp);
  await kv.delete(homepageMessageRateKey(getHomepageMessageRateDay(), clientHash));
};

Deno.test("homepage message handler rejects empty content", async () => {
  const response = await saveHomepageMessageHandler(
    createMessageRequest("   ", "203.0.113.100"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "empty_content",
  });
});

Deno.test("homepage message list rejects requests without the admin key", async () => {
  const response = await listHomepageMessagesHandler(
    new Request("http://localhost/api/messages?limit=50"),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "unauthorized",
  });
});

Deno.test("homepage messages can be saved and listed when KV is available", async () => {
  const marker = `Spec message ${crypto.randomUUID()}`;
  const clientIp = `2001:db8:${crypto.randomUUID().slice(0, 4)}::1`;
  const saveResponse = await saveHomepageMessageHandler(
    createMessageRequest(marker, clientIp),
  );

  if (saveResponse.status === 503) {
    await expect(saveResponse.json()).resolves.toMatchObject({
      ok: false,
      error: "kv_unavailable",
    });
    return;
  }

  expect(saveResponse.status).toBe(200);
  const savePayload = await saveResponse.json();
  const message = savePayload.message;

  try {
    expect("name" in message).toBe(false);

    const listResponse = await listHomepageMessagesHandler(
      new Request("http://localhost/api/messages?limit=50", {
        headers: { "x-openfx-admin-key": "TEST" },
      }),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: message.id,
          content: marker,
        }),
      ]),
    );
  } finally {
    const kv = await getKv();
    await kv.delete(homepageMessageKey(message));
    await deleteMessageRateForIp(clientIp);
  }
});

Deno.test("homepage message handler sanitizes active content", async () => {
  const clientIp = `2001:db8:${crypto.randomUUID().slice(0, 4)}::2`;
  const saveResponse = await saveHomepageMessageHandler(
    createMessageRequest(
      "<script>alert(1)</script>\u0000 javascript:alert(1)",
      clientIp,
    ),
  );

  if (saveResponse.status === 503) {
    await expect(saveResponse.json()).resolves.toMatchObject({
      ok: false,
      error: "kv_unavailable",
    });
    return;
  }

  expect(saveResponse.status).toBe(200);
  const payload = await saveResponse.json();

  try {
    expect(payload.message.content).not.toContain("<script>");
    expect(payload.message.content).not.toMatch(/\bjavascript:/i);
    expect(payload.message.content).toContain("＜script＞");
    expect(payload.message.content).toContain("javascript：");
  } finally {
    const kv = await getKv();
    await kv.delete(homepageMessageKey(payload.message));
    await deleteMessageRateForIp(clientIp);
  }
});

Deno.test("homepage message handler limits each IP to three messages per day", async () => {
  const clientIp = `2001:db8:${crypto.randomUUID().slice(0, 4)}::3`;
  const savedMessages: Array<{ createdAt: string; id: string }> = [];

  try {
    for (let index = 0; index < 3; index += 1) {
      const response = await saveHomepageMessageHandler(
        createMessageRequest(`rate-limit spec ${index}`, clientIp),
      );

      if (response.status === 503) {
        await expect(response.json()).resolves.toMatchObject({
          ok: false,
          error: "kv_unavailable",
        });
        return;
      }

      expect(response.status).toBe(200);
      savedMessages.push((await response.json()).message);
    }

    const blocked = await saveHomepageMessageHandler(
      createMessageRequest("rate-limit spec blocked", clientIp),
    );
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({
      ok: false,
      error: "daily_message_limit",
    });
  } finally {
    if (savedMessages.length > 0) {
      const kv = await getKv();
      await Promise.all(
        savedMessages.map((message) => kv.delete(homepageMessageKey(message))),
      );
      await deleteMessageRateForIp(clientIp);
    }
  }
});
