import { assertEquals } from "@std/assert";

import { cleanupIntegrationIdentity } from "../tools/integration-cleanup.ts";

Deno.test("integration cleanup removes the isolated Keychain service without a node id", async () => {
  const calls: string[] = [];
  await cleanupIntegrationIdentity({
    origin: "https://127.0.0.1:34431",
    cookie: "openfx_admin_session=test",
    keychainService: "OpenFX Node Integration test-run",
    nodeId: "",
  }, {
    revokeNode(origin, cookie) {
      calls.push(`revoke:${origin}:${cookie}`);
      return Promise.resolve();
    },
    deleteKeychainAccount() {
      calls.push("account");
      return Promise.resolve();
    },
    deleteKeychainService(service) {
      calls.push(`service:${service}`);
      return Promise.resolve();
    },
  });

  assertEquals(calls, [
    "revoke:https://127.0.0.1:34431:openfx_admin_session=test",
    "service:OpenFX Node Integration test-run",
  ]);
});

Deno.test("integration cleanup continues after a failed revocation", async () => {
  const calls: string[] = [];
  await cleanupIntegrationIdentity({
    origin: "https://127.0.0.1:34431",
    cookie: "openfx_admin_session=test",
    keychainService: "OpenFX Node Integration test-run",
    nodeId: "node-test",
  }, {
    revokeNode() {
      calls.push("revoke");
      return Promise.reject(new Error("control plane stopped"));
    },
    deleteKeychainAccount(service, account) {
      calls.push(`account:${service}:${account}`);
      return Promise.reject(new Error("already removed"));
    },
    deleteKeychainService(service) {
      calls.push(`service:${service}`);
      return Promise.resolve();
    },
  });

  assertEquals(calls, [
    "revoke",
    "account:OpenFX Node Integration test-run:node-test",
    "service:OpenFX Node Integration test-run",
  ]);
});
