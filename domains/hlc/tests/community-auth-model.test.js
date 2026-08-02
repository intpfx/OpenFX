import assert from "node:assert/strict";
import {
  clearSessionCookie,
  createPasswordCredential,
  createSelfRegisteredResident,
  createSessionCookie,
  digestSessionSecret,
  normalizeUsername,
  readSessionSecret,
  verifyPassword,
} from "../source/community-auth-model.js";

Deno.test("self registration creates only an active resident account", async () => {
  const account = await createSelfRegisteredResident({
    username: "  New.Resident  ",
    displayName: "  王小灯  ",
    password: "resident-password",
    role: "admin",
  }, {
    id: "resident-1",
    now: 1_725_000_000_000,
    credentialOptions: {
      iterations: 1_000,
      salt: new Uint8Array(16).fill(9),
    },
  });

  assert.deepEqual({
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }, {
    id: "resident-1",
    username: "new.resident",
    displayName: "王小灯",
    role: "resident",
    status: "active",
    createdAt: 1_725_000_000_000,
    updatedAt: 1_725_000_000_000,
  });
  assert.equal(
    await verifyPassword("resident-password", account.credential),
    true,
  );
});

Deno.test("usernames are normalized but invalid account names are rejected", () => {
  assert.equal(normalizeUsername("  ShengDeng.Worker  "), "shengdeng.worker");
  assert.throws(() => normalizeUsername("a"), /账号/);
  assert.throws(() => normalizeUsername("含 空格"), /账号/);
});

Deno.test("password credentials use a salted PBKDF2 verifier", async () => {
  const credential = await createPasswordCredential("correct horse battery", {
    iterations: 1_000,
    salt: new Uint8Array(16).fill(7),
  });

  assert.equal(credential.algorithm, "PBKDF2-SHA-256");
  assert.equal(credential.iterations, 1_000);
  assert.equal(await verifyPassword("correct horse battery", credential), true);
  assert.equal(await verifyPassword("wrong password", credential), false);
  assert.equal(credential.hash.includes("correct horse battery"), false);
  await assert.rejects(
    () => createPasswordCredential("x".repeat(257)),
    /密码最多需要 256 个字符/,
  );
});

Deno.test("session cookies are HttpOnly, same-site, and store only the opaque secret", async () => {
  const secret = "session-secret-for-test";
  const digest = await digestSessionSecret(secret);
  assert.notEqual(digest, secret);

  const cookie = createSessionCookie(secret, { secure: true, maxAge: 3600 });
  assert.match(cookie, /^hlc_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(readSessionSecret(new Headers({ Cookie: cookie })), secret);

  const cleared = clearSessionCookie({ secure: true });
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Secure/);
});
