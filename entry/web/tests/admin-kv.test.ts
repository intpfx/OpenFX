import { expect } from "@std/expect";

import { checkAdminAccessHandler } from "../server/routes/api/admin/access.get.ts";
import { deleteAdminKvHandler } from "../server/routes/api/admin/kv.delete.ts";
import { listAdminKvHandler } from "../server/routes/api/admin/kv.get.ts";
import { saveAdminKvHandler } from "../server/routes/api/admin/kv.post.ts";

Deno.test("admin access check validates the server-side admin key", async () => {
  const rejected = checkAdminAccessHandler(
    new Request("http://localhost/api/admin/access"),
  );
  expect(rejected.status).toBe(401);
  await expect(rejected.json()).resolves.toMatchObject({
    ok: false,
    error: "unauthorized",
  });

  const accepted = checkAdminAccessHandler(
    new Request("http://localhost/api/admin/access", {
      headers: { "x-openfx-admin-key": "TEST" },
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
        "x-openfx-admin-key": "TEST",
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
        headers: { "x-openfx-admin-key": "TEST" },
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
        headers: { "x-openfx-admin-key": "TEST" },
      }),
    );

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      ok: true,
      deleted: key,
    });
  }
});
