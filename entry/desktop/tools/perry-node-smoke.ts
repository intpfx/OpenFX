import { homedir } from "node:os";
import { join } from "node:path";
import { exit } from "node:process";

import {
  APPROVAL_TTL_MS,
  OPENFX_NODE_ERROR_CODES,
} from "../../../domains/_shared/openfx-node/constants.ts";
import { decodeBase64Url } from "../../../domains/_shared/openfx-node/encoding.ts";
import { SafetyActionGate } from "../../../domains/e/src/core/safety-action-gate.ts";
import {
  createAgentToolRuntime,
  createMemoryApprovalRequestRepository,
} from "../src/core/agent-runtime.ts";
import type { AuditLog } from "../src/core/audit-log.ts";
import { createDesktopJournal } from "../src/core/durable-journal.ts";
import { createDesktopRouteDispatcher } from "../src/core/route-dispatcher.ts";
import { isPublicIpv6 } from "../src/core/system-parsers.ts";
import type { DesktopPreferences, RelayStatus } from "../src/core/types.ts";
import { createControlPlaneClient } from "../src/native/control-plane-client.ts";
import { requestJson, requestTextStream } from "../src/native/http-json.ts";
import { createKeychain } from "../src/native/keychain.ts";
import { createMacSystemAdapter } from "../src/native/mac-system.ts";
import { createNodeCryptoAdapter } from "../src/native/node-crypto.ts";
import { createNodeEventReporter } from "../src/native/node-event-reporter.ts";
import { startNodeServer } from "../src/native/node-server.ts";
import { createOmlxClient } from "../src/native/omlx-client.ts";
import { createPairingService } from "../src/native/pairing-service.ts";
import { createRelayReporter } from "../src/native/relay-reporter.ts";
import { createSqliteJournalStorage } from "../src/native/sqlite-journal-storage.ts";

const serverUrl = requiredEnv("OPENFX_SMOKE_SERVER_URL");
const pairingCode = requiredEnv("OPENFX_SMOKE_PAIRING_CODE");
const publicIpv6 = requiredEnv("OPENFX_SMOKE_PUBLIC_IPV6").toLowerCase();
const keychainService = requiredEnv("OPENFX_SMOKE_KEYCHAIN_SERVICE");
const journalPath = process.env.OPENFX_SMOKE_JOURNAL_PATH ?? join(
  homedir(),
  "Library",
  "Application Support",
  "OpenFX Node",
  "integration-smoke.sqlite",
);

if (!isPublicIpv6(publicIpv6)) {
  throw new Error("OPENFX_SMOKE_PUBLIC_IPV6 must be a public IPv6 address.");
}

const cryptoAdapter = createNodeCryptoAdapter();
const controlPlane = createControlPlaneClient(requestJson, {
  crypto: cryptoAdapter,
});
console.error("[openfx-smoke] native adapters initialized");
const keychain = createKeychain(undefined, keychainService);
let savedPreferences: DesktopPreferences | null = null;
const pairingService = createPairingService({
  client: controlPlane,
  preferences: {
    load: () => Promise.resolve(savedPreferences),
    save(value) {
      savedPreferences = value;
      return Promise.resolve();
    },
  },
  keychain,
});

const pairing = await pairingService.pair({
  serverUrl,
  code: pairingCode,
  name: "OpenFX Perry integration node",
  publicIpv6,
});
console.error("[openfx-smoke] HTTPS pairing completed");
const restored = await pairingService.restore();
if (!restored || restored.nodeSecret !== pairing.nodeSecret) {
  throw new Error("Keychain pairing recovery failed.");
}
const restoredPairing = restored;

const journal = createDesktopJournal(createSqliteJournalStorage(journalPath));
console.error("[openfx-smoke] Keychain recovery and SQLite journal completed");
const audit: AuditLog = {
  append: (event) => journal.appendAudit(event),
  list: (limit) => journal.listAudit(limit),
};
const reporter = createRelayReporter(controlPlane);
reporter.setPairing(restored);
const eventReporter = createNodeEventReporter(controlPlane);
eventReporter.setPairing(restored);
const macSystem = createMacSystemAdapter();
const state = await macSystem.collect();
console.error("[openfx-smoke] macOS telemetry collection completed");
const observedState = {
  ...state,
  network: {
    ...state.network,
    publicIpv6,
    observedIpv6: [publicIpv6],
    mismatch: false,
    observationErrors: [],
  },
};
let relayEnabled = true;
let ids = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now()}-${++ids}`;
const gate = new SafetyActionGate({
  now: Date.now,
  createId: () => nextId("gate"),
  consumptionStore: journal,
});
const runtime = createAgentToolRuntime({
  gate,
  approvals: journal,
  audit,
  nodeId: () => restoredPairing.preferences.nodeId,
  ownPid: () => process.pid,
  now: Date.now,
  createId: () => nextId("action"),
  read: {
    overview: () => Promise.resolve(observedState.overview),
    processes: () => Promise.resolve(observedState.processes),
    network: () => Promise.resolve(observedState.network),
    relay: () => Promise.resolve(relayStatus()),
  },
  effects: {
    inspectProcess: (pid) => macSystem.inspectProcess(pid),
    kill: (pid, expected) => macSystem.kill(pid, expected),
    openApplication: (application) => macSystem.openApplication(application),
    updateRelay(enabled) {
      relayEnabled = enabled;
      return Promise.resolve(relayStatus());
    },
  },
  events: {
    approvalRequested: (request) =>
      eventReporter.emit({
        type: "approval.requested",
        data: { id: request.id, summary: request.reason },
      }),
    approvalResolved: (request, decision) =>
      eventReporter.emit({
        type: "approval.resolved",
        data: { id: request.id, decision },
      }),
  },
});
const omlx = createOmlxClient(requestJson, requestTextStream);
const dispatch = createDesktopRouteDispatcher({
  overview: () => Promise.resolve(observedState.overview),
  processes: () => Promise.resolve(observedState.processes),
  network: () => Promise.resolve(observedState.network),
  relay: () => Promise.resolve(relayStatus()),
  chat: (message, onDelta) => omlx.chat(message, onDelta),
  agentDelta: (data) => eventReporter.emit({ type: "agent.delta", data }),
  invokeTool: (toolId, input) => runtime.invoke(toolId, input),
  listApprovals: () => runtime.listApprovals(),
  resolveApproval: (input) => runtime.resolve(input),
}, { createId: () => nextId("message") });

await assertExpiredApproval();
console.error("[openfx-smoke] approval expiry completed");
const nodeServer = await startNodeServer({
  crypto: cryptoAdapter,
  loadSecret: () => Promise.resolve(decodeBase64Url(restoredPairing.nodeSecret)),
  dispatch,
  replayStore: journal,
});
console.error("[openfx-smoke] IPv6 node server started");
await reporter.report(observedState);
const reportStatus = reporter.status();
if (!reportStatus.lastReportedAt || reportStatus.errorMessage) {
  await nodeServer.close();
  throw new Error(`Control-plane report failed: ${reportStatus.errorMessage}`);
}
const omlxStatus = await omlx.status();
console.error("[openfx-smoke] signed reports and OMLX probe completed");

console.log(JSON.stringify({
  ok: true,
  nodeId: restoredPairing.preferences.nodeId,
  keychainService,
  keychainRestored: true,
  publicIpv6,
  nodePort: nodeServer.port,
  telemetryCollectedAt: observedState.overview.collectedAt,
  omlx: omlxStatus,
  expiredApproval: OPENFX_NODE_ERROR_CODES.approvalExpired,
}));

const keepAlive = setInterval(() => undefined, 1_000);
const shutdown = async (): Promise<void> => {
  clearInterval(keepAlive);
  await nodeServer.close().catch(() => undefined);
  await keychain.remove(restoredPairing.preferences.nodeId);
  exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

function relayStatus(): RelayStatus {
  const status = reporter.status();
  return { ...status, enabled: relayEnabled };
}

async function assertExpiredApproval(): Promise<void> {
  const approvals = createMemoryApprovalRequestRepository();
  let approvalNow = Date.now();
  const runtime = createAgentToolRuntime({
    gate: new SafetyActionGate({
      now: () => approvalNow,
      createId: () => nextId("expired-gate"),
      consumptionStore: approvals,
    }),
    approvals,
    audit: {
      append: (event) => approvals.appendAudit(event),
      list: (limit) => approvals.listAudit(limit),
    },
    nodeId: () => restoredPairing.preferences.nodeId,
    ownPid: () => process.pid,
    now: () => approvalNow,
    createId: () => nextId("expired-action"),
    read: {
      overview: () => Promise.resolve({}),
      processes: () => Promise.resolve([]),
      network: () => Promise.resolve({}),
      relay: () => Promise.resolve({}),
    },
    effects: {
      inspectProcess: () => Promise.resolve(null),
      kill: () => Promise.resolve({ ok: true }),
      openApplication: () => Promise.resolve({ ok: true }),
      updateRelay: () => Promise.resolve({ ok: true }),
    },
  });
  const invocation = await runtime.invoke("relay.update", { enabled: false });
  if (!invocation.approval) throw new Error("Expired approval was not created.");
  approvalNow += APPROVAL_TTL_MS + 1;
  const resolution = await runtime.resolve({
    id: invocation.approval.id,
    decision: "approved",
    parameterFingerprint: invocation.approval.parameterFingerprint!,
  });
  if (resolution.error !== OPENFX_NODE_ERROR_CODES.approvalExpired) {
    throw new Error(`Expired approval returned ${resolution.error ?? "no error"}.`);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
