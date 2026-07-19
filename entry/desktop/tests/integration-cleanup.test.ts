import { assert, assertEquals } from "@std/assert";

import * as cleanupTools from "../tools/integration-cleanup.ts";

import {
  cleanupIntegrationIdentity,
  runBoundedCommand,
} from "../tools/integration-cleanup.ts";

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

Deno.test("bounded cleanup command escalates and returns after its deadline", async () => {
  let resolveStatus!: (status: { success: boolean }) => void;
  const signals: string[] = [];
  const status = new Promise<{ success: boolean }>((resolve) => {
    resolveStatus = resolve;
  });

  const success = await runBoundedCommand(() => ({
    status,
    kill(signal) {
      signals.push(signal);
      if (signal === "SIGKILL") resolveStatus({ success: false });
    },
  }), { timeoutMs: 5, terminationGraceMs: 5 });

  assertEquals(success, false);
  assertEquals(signals, ["SIGTERM", "SIGKILL"]);
});

Deno.test("desktop child collection bounds clean exit, escalates, and reaps output", async () => {
  const collectBoundedChild = Reflect.get(cleanupTools, "collectBoundedChild") as
    | ((child: unknown, options: unknown) => Promise<{
      output: { stdout: Uint8Array; stderr: Uint8Array };
      cleanExitTimedOut: boolean;
    }>)
    | undefined;
  assert(collectBoundedChild, "collectBoundedChild must be exported");

  let resolveOutput!: (output: {
    success: boolean;
    code: number;
    signal: string;
    stdout: Uint8Array;
    stderr: Uint8Array;
  }) => void;
  const signals: string[] = [];
  const output = new Promise<Parameters<typeof resolveOutput>[0]>((resolve) => {
    resolveOutput = resolve;
  });

  const result = await collectBoundedChild({
    output: () => output,
    kill(signal: string) {
      signals.push(signal);
      if (signal === "SIGKILL") {
        resolveOutput({
          success: false,
          code: 137,
          signal,
          stdout: new TextEncoder().encode("bounded stdout"),
          stderr: new TextEncoder().encode("bounded stderr"),
        });
      }
    },
  }, {
    deadlineAt: Date.now() + 5,
    terminationGraceMs: 5,
  });

  assertEquals(signals, ["SIGTERM", "SIGKILL"]);
  assertEquals(result.cleanExitTimedOut, true);
  assertEquals(new TextDecoder().decode(result.output.stdout), "bounded stdout");
  assertEquals(new TextDecoder().decode(result.output.stderr), "bounded stderr");
});
