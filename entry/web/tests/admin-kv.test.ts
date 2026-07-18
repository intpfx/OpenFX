import { expect } from "@std/expect";

import { checkAdminAccessHandler } from "../server/routes/api/admin/access.get.ts";
import { deleteAdminKvHandler } from "../server/routes/api/admin/kv.delete.ts";
import { listAdminKvHandler } from "../server/routes/api/admin/kv.get.ts";
import { saveAdminKvHandler } from "../server/routes/api/admin/kv.post.ts";
import { createAdminSessionHandler } from "../server/routes/api/admin/session.post.ts";

const adminCookie = async (): Promise<string> => {
  const response = await createAdminSessionHandler(
    new Request("http://localhost/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "TEST" }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
};

Deno.test("admin access check validates the cookie session", async () => {
  const rejected = await checkAdminAccessHandler(
    new Request("http://localhost/api/admin/access"),
  );
  expect(rejected.status).toBe(401);
  await expect(rejected.json()).resolves.toMatchObject({
    ok: false,
    error: "unauthorized",
  });

  const legacy = await checkAdminAccessHandler(
    new Request("http://localhost/api/admin/access", {
      headers: { "x-openfx-admin-key": "TEST" },
    }),
  );
  expect(legacy.status).toBe(401);

  const accepted = await checkAdminAccessHandler(
    new Request("http://localhost/api/admin/access", {
      headers: { cookie: await adminCookie() },
    }),
  );
  expect(accepted.status).toBe(200);
  await expect(accepted.json()).resolves.toMatchObject({ ok: true });
});

Deno.test("admin KV list rejects requests without the admin key", async () => {
  const response = await listAdminKvHandler(
    new Request("http://localhost/api/admin/kv"),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: "unauthorized",
  });
});

Deno.test("admin KV handler can save, list, and delete a record", async () => {
  const cookie = await adminCookie();
  const key = ["test", "admin-kv", crypto.randomUUID()];
  const value = {
    ipv6: "2001:db8::42",
    port: 4242,
  };

  const saveResponse = await saveAdminKvHandler(
    new Request("http://localhost/api/admin/kv", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ key, value }),
    }),
  );

  if (saveResponse.status === 503) {
    await expect(saveResponse.json()).resolves.toMatchObject({
      ok: false,
      error: "kv_unavailable",
    });
    return;
  }

  expect(saveResponse.status).toBe(200);

  try {
    const params = new URLSearchParams({
      prefix: JSON.stringify(["test", "admin-kv"]),
    });
    const listResponse = await listAdminKvHandler(
      new Request(`http://localhost/api/admin/kv?${params.toString()}`, {
        headers: { cookie },
      }),
    );

    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key,
          value,
        }),
      ]),
    );
  } finally {
    const params = new URLSearchParams({ key: JSON.stringify(key) });
    const deleteResponse = await deleteAdminKvHandler(
      new Request(`http://localhost/api/admin/kv?${params.toString()}`, {
        method: "DELETE",
        headers: { cookie },
      }),
    );

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      ok: true,
      deleted: key,
    });
  }
});
