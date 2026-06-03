import { expect } from "@std/expect";

import { saveAdminUnlockRuleHandler } from "../server/routes/api/admin/unlocks.post.ts";
import { listAdminUnlockRulesHandler } from "../server/routes/api/admin/unlocks.get.ts";
import { deleteUnlockRule, saveUnlockRule } from "../server/admin/unlocks.ts";
import { unlockHandler } from "../server/routes/api/unlock.post.ts";

Deno.test("unlock handler rejects requests without a key", async () => {
  const response = await unlockHandler(
    new Request("http://localhost/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "" }),
    }),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "missing_key",
  });
});

Deno.test("unlock handler routes TEST key to admin mode locally", async () => {
  const response = await unlockHandler(
    new Request("http://localhost/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "TEST" }),
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    mode: "admin",
    redirect: "/admin",
  });
});

Deno.test("unlock handler rejects wrong-cased admin key locally", async () => {
  const response = await unlockHandler(
    new Request("http://localhost/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "test" }),
    }),
  );

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "invalid_key",
  });
});

Deno.test("admin unlock list rejects wrong-cased admin key locally", async () => {
  const response = await listAdminUnlockRulesHandler(
    new Request("http://localhost/api/admin/unlocks", {
      headers: { "x-openfx-admin-key": "test" },
    }),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "unauthorized",
  });
});

Deno.test("unlock handler returns configured project ids for a saved rule", async () => {
  const key = `spec-${crypto.randomUUID().slice(0, 8)}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await saveUnlockRule({
    key,
    label: "Spec rule",
    projectIds: ["hidden-1", "hidden-2"],
    expiresAt,
  });

  try {
    const response = await unlockHandler(
      new Request("http://localhost/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      mode: "projects",
      key,
      label: "Spec rule",
      expiresAt,
      projectIds: ["hidden-1", "hidden-2"],
    });
  } finally {
    await deleteUnlockRule(key);
  }
});

Deno.test("unlock handler rejects expired rules", async () => {
  const key = `spec-${crypto.randomUUID().slice(0, 8)}`;

  await saveUnlockRule({
    key,
    label: "Expired rule",
    projectIds: ["hidden-1"],
    expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
  });

  try {
    const response = await unlockHandler(
      new Request("http://localhost/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "invalid_key",
    });
  } finally {
    await deleteUnlockRule(key);
  }
});

Deno.test("admin unlock save generates a five-character key", async () => {
  const response = await saveAdminUnlockRuleHandler(
    new Request("http://localhost/api/admin/unlocks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openfx-admin-key": "TEST",
      },
      body: JSON.stringify({
        label: "Generated rule",
        projectIds: ["hidden-1"],
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      }),
    }),
  );

  expect(response.status).toBe(200);

  const payload = await response.json();
  expect(payload).toMatchObject({
    ok: true,
    rule: { label: "Generated rule", projectIds: ["hidden-1"] },
  });
  expect(payload.rule.key).toMatch(/^[A-Z0-9]{5}$/);

  await deleteUnlockRule(payload.rule.key);
});
