import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupIntegrationIdentity,
  runBoundedCommand,
} from "./integration-cleanup.ts";
import { readStartupMessages } from "./integration-startup.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const webRoot = join(root, "entry/web");
const adminKey = "openfx-integration-admin-key";
const credentialKey = "0123456789abcdef0123456789abcdef";
const tlsPort = 34_431;
const nitroPort = 8_000;

let temporaryDirectory = "";
let nitro: Deno.ChildProcess | null = null;
let node: Deno.ChildProcess | null = null;
let tls: Deno.HttpServer | null = null;
let nodeId = "";
let keychainService = "";
let cleanupClient: Deno.HttpClient | null = null;
let cleanupOrigin = "";
let cleanupCookie = "";

try {
  await assertPortAvailable(nitroPort);
  await assertPortAvailable(24_531, "::1");
  const publicIpv6 = await assignedPublicIpv6();
  temporaryDirectory = await Deno.makeTempDir({
    prefix: "openfx-console-integration-",
  });
  const certificatePath = join(temporaryDirectory, "loopback.pem");
  const privateKeyPath = join(temporaryDirectory, "loopback-key.pem");
  await command("/opt/homebrew/bin/mkcert", [
    "-cert-file",
    certificatePath,
    "-key-file",
    privateKeyPath,
    "localhost",
    "127.0.0.1",
    "::1",
  ]);
  const caRoot = (await command("/opt/homebrew/bin/mkcert", ["-CAROOT"]))
    .trim();
  const rootCertificatePath = join(caRoot, "rootCA.pem");
  const rootCertificate = await Deno.readTextFile(rootCertificatePath);

  await command("/opt/homebrew/bin/perry", [
    "compile",
    "entry/desktop/tools/perry-node-smoke.ts",
    "-o",
    join(temporaryDirectory, "openfx-perry-node-smoke"),
  ], { PERRY_NO_UPDATE_CHECK: "1" });

  nitro = new Deno.Command(Deno.execPath(), {
    args: ["run", "--unstable-kv", "-A", ".output/server/index.ts"],
    cwd: webRoot,
    env: {
      ...Deno.env.toObject(),
      DENO_DIR: join(temporaryDirectory, "deno-dir"),
      OPENFX_ADMIN_KEY: adminKey,
      OPENFX_NODE_CREDENTIAL_KEY: credentialKey,
      DENO_DEPLOYMENT_ID: "openfx-integration-smoke",
    },
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  await waitForHttp(`http://127.0.0.1:${nitroPort}/api/health`);

  const certificate = await Deno.readTextFile(certificatePath);
  const privateKey = await Deno.readTextFile(privateKeyPath);
  tls = Deno.serve({
    hostname: "127.0.0.1",
    port: tlsPort,
    cert: certificate,
    key: privateKey,
    onListen() {},
  }, (request) => proxyToNitro(request));
  const client = Deno.createHttpClient({ caCerts: [rootCertificate] });
  const origin = `https://127.0.0.1:${tlsPort}`;
  cleanupClient = client;
  // Cleanup stays inside this parent process and talks only to the private Nitro
  // loopback listener. Product pairing, reports, and Relay still use HTTPS.
  cleanupOrigin = `http://127.0.0.1:${nitroPort}`;
  const login = await requestJson(client, `${origin}/api/admin/session`, {
    method: "POST",
    body: { key: adminKey },
  });
  assert(login.response.status === 200, "admin session login failed");
  const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  assert(cookie.startsWith("openfx_admin_session="), "session cookie missing");
  cleanupCookie = cookie;
  const pairing = await requestJson(client, `${origin}/api/console/pairings`, {
    method: "POST",
    cookie,
    body: {},
  });
  assert(pairing.response.status === 201, "pairing code creation failed");
  const pairingCode = stringValue(pairing.body.code);
  assert(pairingCode.length === 8, "pairing code is not 8 characters");

  keychainService = `OpenFX Node Integration ${crypto.randomUUID()}`;
  const binaryPath = join(temporaryDirectory, "openfx-perry-node-smoke");
  node = new Deno.Command(binaryPath, {
    cwd: root,
    env: {
      ...Deno.env.toObject(),
      NODE_EXTRA_CA_CERTS: rootCertificatePath,
      OPENFX_SMOKE_SERVER_URL: origin,
      OPENFX_SMOKE_PAIRING_CODE: pairingCode,
      OPENFX_SMOKE_PUBLIC_IPV6: publicIpv6,
      OPENFX_SMOKE_KEYCHAIN_SERVICE: keychainService,
      OPENFX_SMOKE_JOURNAL_PATH: join(temporaryDirectory, "journal.sqlite"),
    },
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const ready = await readStartupMessages(node.stdout, {
    timeoutMs: 45_000,
    onMessage(message) {
      if (message.phase !== "paired") return;
      const pairedNodeId = stringValue(message.nodeId);
      assert(pairedNodeId.length > 0, "compiled Perry node reported an empty nodeId");
      nodeId = pairedNodeId;
    },
  });
  if (!ready) {
    const stderr = await new Response(node.stderr).text();
    throw new Error(`Perry node did not report readiness: ${stderr.slice(-4_000)}`);
  }
  assert(ready.ok === true, "compiled Perry node did not become ready");
  const readyNodeId = stringValue(ready.nodeId);
  assert(readyNodeId.length > 0, "compiled Perry node did not report nodeId");
  assert(
    !nodeId || readyNodeId === nodeId,
    "Perry startup nodeId changed after pairing",
  );
  nodeId = readyNodeId;
  assert(ready.keychainRestored === true, "Keychain restore was not proven");
  assert(ready.publicIpv6 === publicIpv6, "Perry node used the wrong IPv6");
  assert(ready.nodePort === 24_531, "Perry node did not bind 24531");
  assert(
    objectValue(ready.omlx).online === false,
    "OMLX was expected to be unavailable for this smoke",
  );
  assert(
    ready.expiredApproval === "approval_expired",
    "compiled approval expiry self-test failed",
  );
  await verifyKeychain(keychainService, nodeId);

  const telemetry = await requestJson(client, `${origin}/api/console/telemetry`, {
    cookie,
  });
  assert(telemetry.response.status === 200, "telemetry history request failed");
  assert(
    Array.isArray(telemetry.body.minutes) && telemetry.body.minutes.length === 1,
    "signed telemetry did not create a minute aggregate",
  );
  const initialSse = await readSse(
    client,
    `${origin}/api/console/events?after=0`,
    cookie,
    (events) =>
      events.some((event) => event.type === "heartbeat") &&
      events.some((event) => event.type === "telemetry"),
  );

  const overview = await requestJson(client, `${origin}/api/console/overview`, {
    cookie,
  });
  assert(overview.response.status === 200, "fixed overview Relay failed");
  const processes = await requestJson(client, `${origin}/api/console/processes`, {
    cookie,
  });
  assert(processes.response.status === 200, "fixed process Relay failed");

  const agentOffline = await requestJson(
    client,
    `${origin}/api/console/agent/messages`,
    {
      method: "POST",
      cookie,
      body: {
        conversationId: "integration-offline-turn",
        message: "Report the current node status.",
      },
    },
  );
  assert(
    agentOffline.response.status === 200 && agentOffline.body.error === "agent_offline",
    "OMLX outage did not degrade only the Agent",
  );
  assert(
    (await requestJson(client, `${origin}/api/console/overview`, { cookie }))
      .response.status === 200,
    "node monitoring failed after OMLX degradation",
  );

  const executable = await requestApproval(
    client,
    origin,
    cookie,
    false,
  );
  const executed = await resolveApproval(
    client,
    origin,
    cookie,
    executable,
    "approved",
  );
  assert(executed.body.applied === true, "approved Relay effect was not applied");
  const replayed = await resolveApproval(
    client,
    origin,
    cookie,
    executable,
    "approved",
  );
  assert(
    replayed.body.error === "approval_already_applied",
    "approval replay was not rejected",
  );
  const rejectable = await requestApproval(client, origin, cookie, true);
  const rejected = await resolveApproval(
    client,
    origin,
    cookie,
    rejectable,
    "rejected",
  );
  assert(
    rejected.body.ok === true && rejected.body.applied === false,
    "approval rejection failed",
  );

  const reconnectedSse = await readSse(
    client,
    `${origin}/api/console/events`,
    cookie,
    (events) => events.some((event) => event.type === "approval.requested"),
    initialSse.at(-1)?.id ?? 0,
  );
  assert(
    reconnectedSse.every((event) => event.id > (initialSse.at(-1)?.id ?? 0)),
    "SSE reconnect replayed an already-consumed event",
  );

  node.kill("SIGTERM");
  await withTimeout(node.status, 8_000, "Perry node did not terminate cleanly");
  node = null;
  const offline = await requestJson(client, `${origin}/api/console/overview`, {
    cookie,
  });
  assert(
    offline.response.status === 503 && offline.body.error === "node_offline",
    "Relay failure did not produce node_offline",
  );
  await verifyKeychainRemoved(keychainService, nodeId);
  await runRetentionProbe();

  console.log(JSON.stringify(
    {
      ok: true,
      nitroBuild: "entry/web/.output/server/index.ts",
      compiledPerryNode: true,
      publicIpv6,
      keychainIsolatedAndRemoved: true,
      signedHeartbeat: true,
      signedTelemetryMinutes: telemetry.body.minutes.length,
      sseReconnect: true,
      relayOverview: true,
      relayProcesses: true,
      omlxOfflineDegradedOnly: true,
      approvalExecuteRejectExpireReplay: true,
      telemetryRetentionDays: 7,
      auditRetention: "append-only",
    },
    null,
    2,
  ));
} finally {
  if (node) {
    try {
      node.kill("SIGTERM");
      await withTimeout(node.status, 3_000, "node cleanup timeout");
    } catch {
      try {
        node.kill("SIGKILL");
      } catch {
        // The child may already be gone.
      }
    }
  }
  await cleanupIntegrationIdentity({
    origin: cleanupOrigin,
    cookie: cleanupCookie,
    keychainService,
    nodeId,
  }, {
    async revokeNode(origin, cookie) {
      const response = await fetch(`${origin}/api/console/node`, {
        method: "DELETE",
        headers: { cookie, connection: "close" },
        signal: AbortSignal.timeout(3_000),
      });
      await response.arrayBuffer();
    },
    deleteKeychainAccount,
    deleteKeychainService,
  });
  cleanupClient?.close();
  cleanupClient = null;
  if (nitro) {
    try {
      nitro.kill("SIGTERM");
      await withTimeout(nitro.status, 3_000, "Nitro cleanup timeout");
    } catch {
      try {
        nitro.kill("SIGKILL");
      } catch {
        // The child may already be gone.
      }
    }
  }
  if (tls) {
    tls.unref();
    await withTimeout(tls.shutdown(), 3_000, "TLS proxy cleanup timeout").catch(
      () => undefined,
    );
  }
  if (temporaryDirectory.startsWith("/var/folders/")) {
    await Deno.remove(temporaryDirectory, { recursive: true }).catch(() => undefined);
  }
}

interface JsonResult {
  response: Response;
  body: Record<string, unknown>;
}

interface SseEvent {
  id: number;
  type: string;
  data: string;
}

async function proxyToNitro(request: Request): Promise<Response> {
  const source = new URL(request.url);
  const target = new URL(
    source.pathname + source.search,
    `http://127.0.0.1:${nitroPort}`,
  );
  const headers = new Headers(request.headers);
  headers.set("host", `127.0.0.1:${tlsPort}`);
  headers.set("x-forwarded-proto", "https");
  return await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : request.body,
    redirect: "manual",
  });
}

async function requestJson(
  client: Deno.HttpClient,
  url: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    cookie?: string;
    body?: unknown;
  } = {},
): Promise<JsonResult> {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetch(url, {
    method: options.method ?? "GET",
    client,
    headers: {
      ...(payload ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: payload,
  });
  let body: Record<string, unknown> = {};
  try {
    body = objectValue(await response.json());
  } catch {
    // Assertions report the HTTP status for non-JSON failures.
  }
  return { response, body };
}

async function requestApproval(
  client: Deno.HttpClient,
  origin: string,
  cookie: string,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  const result = await requestJson(client, `${origin}/api/console/relay`, {
    method: "POST",
    cookie,
    body: { enabled },
  });
  assert(result.response.status === 200, "Relay approval request failed");
  const approval = objectValue(result.body.approval);
  assert(
    result.body.approvalRequired === true && stringValue(approval.id).length > 0,
    "Relay effect did not create an approval",
  );
  return approval;
}

function resolveApproval(
  client: Deno.HttpClient,
  origin: string,
  cookie: string,
  approval: Record<string, unknown>,
  decision: "approved" | "rejected",
): Promise<JsonResult> {
  return requestJson(client, `${origin}/api/console/approvals`, {
    method: "POST",
    cookie,
    body: {
      id: approval.id,
      decision,
      parameterFingerprint: approval.parameterFingerprint,
    },
  });
}

async function readSse(
  client: Deno.HttpClient,
  url: string,
  cookie: string,
  complete: (events: SseEvent[]) => boolean,
  lastEventId = 0,
): Promise<SseEvent[]> {
  const controller = new AbortController();
  const response = await fetch(url, {
    client,
    headers: {
      cookie,
      accept: "text/event-stream",
      ...(lastEventId > 0 ? { "last-event-id": String(lastEventId) } : {}),
    },
    signal: controller.signal,
  });
  assert(response.status === 200, "SSE connection failed");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  const deadline = Date.now() + 8_000;
  try {
    while (Date.now() < deadline) {
      const result = await withTimeout(reader.read(), 2_000, "SSE read timeout");
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseEvent(block);
        if (event) events.push(event);
        boundary = buffer.indexOf("\n\n");
      }
      if (complete(events)) return events;
    }
  } finally {
    controller.abort();
    await reader.cancel().catch(() => undefined);
  }
  throw new Error(`SSE completion predicate failed: ${JSON.stringify(events)}`);
}

function parseSseEvent(block: string): SseEvent | null {
  let id = 0;
  let type = "";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) id = Number(line.slice(3).trim());
    else if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  return Number.isSafeInteger(id) && id > 0 && type
    ? { id, type, data: data.join("\n") }
    : null;
}

async function runRetentionProbe(): Promise<void> {
  const commandResult = await new Deno.Command(Deno.execPath(), {
    args: [
      "test",
      "--unstable-kv",
      "--allow-env",
      "--allow-read",
      "--allow-write",
      "entry/web/tests/console-retention-integration.test.ts",
    ],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!commandResult.success) {
    throw new Error(
      `Deno KV retention probe failed: ${
        new TextDecoder().decode(commandResult.stderr)
      }`,
    );
  }
}

async function assignedPublicIpv6(): Promise<string> {
  const output = await command("/sbin/ifconfig", ["en1"]);
  const addresses = [...output.matchAll(/\binet6\s+([0-9a-f:]+)\b/gi)]
    .map((match) => match[1]!.toLowerCase())
    .filter((value) => {
      const first = Number.parseInt(value.split(":", 1)[0] ?? "0", 16);
      return first >= 0x2000 && first <= 0x3fff;
    });
  if (addresses.length === 0) {
    throw new Error("No machine-assigned public IPv6 was found on en1.");
  }
  return addresses[0]!;
}

async function assertPortAvailable(port: number, hostname = "127.0.0.1") {
  try {
    const connection = await Deno.connect({ hostname, port });
    connection.close();
    throw new Error(`${hostname}:${port} is already in use.`);
  } catch (error) {
    if (error instanceof Deno.errors.ConnectionRefused) return;
    throw error;
  }
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch {
      // Nitro is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function verifyKeychain(service: string, account: string): Promise<void> {
  const result = await new Deno.Command("/usr/bin/security", {
    args: ["find-generic-password", "-s", service, "-a", account],
    stdout: "null",
    stderr: "piped",
  }).output();
  assert(result.success, "isolated Keychain credential was not persisted");
}

async function verifyKeychainRemoved(service: string, account: string) {
  const result = await new Deno.Command("/usr/bin/security", {
    args: ["find-generic-password", "-s", service, "-a", account],
    stdout: "null",
    stderr: "null",
  }).output();
  assert(!result.success, "isolated Keychain credential was not removed");
}

async function deleteKeychainAccount(service: string, account: string) {
  await runSecurityCleanup([
    "delete-generic-password",
    "-s",
    service,
    "-a",
    account,
  ]);
}

async function deleteKeychainService(service: string) {
  await runSecurityCleanup(["delete-generic-password", "-s", service]);
}

async function runSecurityCleanup(args: string[]): Promise<void> {
  await runBoundedCommand(() =>
    new Deno.Command("/usr/bin/security", {
      args,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn(), { timeoutMs: 2_000, terminationGraceMs: 250 });
}

async function command(
  executable: string,
  args: string[],
  env?: Record<string, string>,
): Promise<string> {
  const result = await new Deno.Command(executable, {
    args,
    cwd: root,
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = new TextDecoder().decode(result.stdout);
  if (!result.success) {
    throw new Error(
      `${executable} ${args.join(" ")} failed: ${
        new TextDecoder().decode(result.stderr)
      }`,
    );
  }
  return stdout;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeoutMs)
    ),
  ]);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
