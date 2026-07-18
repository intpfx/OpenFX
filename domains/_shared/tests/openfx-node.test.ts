import { assert, assertEquals, assertRejects } from "jsr:@std/assert";

import {
  ADMIN_SESSION_TTL_MS,
  aggregateTelemetrySamples,
  APPROVAL_TTL_MS,
  createReplayProtector,
  createWebCryptoAdapter,
  generatePairingCode,
  NODE_PORT,
  OPENFX_NODE_ERROR_CODES,
  openRelayEnvelope,
  PAIRING_CODE_LENGTH,
  PAIRING_TTL_MS,
  PROTOCOL_VERSION,
  retainTelemetryMinutes,
  sealRelayEnvelope,
  signRequest,
  TELEMETRY_AGGREGATE_MS,
  TELEMETRY_RETENTION_MS,
  TELEMETRY_SAMPLE_MS,
  validatePairingCode,
  verifySignedRequest,
} from "../openfx-node/mod.ts";

Deno.test("OpenFX node protocol exposes stable v1 timing and port constants", () => {
  assertEquals(PROTOCOL_VERSION, 1);
  assertEquals(NODE_PORT, 24_531);
  assertEquals(PAIRING_CODE_LENGTH, 8);
  assertEquals(PAIRING_TTL_MS, 10 * 60_000);
  assertEquals(ADMIN_SESSION_TTL_MS, 12 * 60 * 60_000);
  assertEquals(APPROVAL_TTL_MS, 5 * 60_000);
  assertEquals(TELEMETRY_SAMPLE_MS, 5_000);
  assertEquals(TELEMETRY_AGGREGATE_MS, 60_000);
  assertEquals(TELEMETRY_RETENTION_MS, 7 * 24 * 60 * 60_000);
  assertEquals(OPENFX_NODE_ERROR_CODES.replayDetected, "node_replay_detected");
});

Deno.test("telemetry samples aggregate into aligned one-minute summaries", () => {
  const minutes = aggregateTelemetrySamples([
    sample(65_000, 20, 100, 1_000, 50, 500, 1_000, 2_000, 80, 10),
    sample(70_000, 40, 300, 1_000, 70, 500, 1_400, 2_600, null, 14),
    sample(125_000, 90, 900, 1_000, 90, 500, 2_000, 3_000, 70, 20),
  ]);

  assertEquals(minutes, [
    {
      minuteStart: 60_000,
      sampleCount: 2,
      cpuUsagePercent: 30,
      memoryUsedBytes: 200,
      memoryTotalBytes: 1_000,
      diskUsedBytes: 60,
      diskTotalBytes: 500,
      networkRxBytes: 400,
      networkTxBytes: 600,
      batteryPercent: 80,
      processCount: 12,
    },
    {
      minuteStart: 120_000,
      sampleCount: 1,
      cpuUsagePercent: 90,
      memoryUsedBytes: 900,
      memoryTotalBytes: 1_000,
      diskUsedBytes: 90,
      diskTotalBytes: 500,
      networkRxBytes: 0,
      networkTxBytes: 0,
      batteryPercent: 70,
      processCount: 20,
    },
  ]);
});

Deno.test("telemetry retention keeps the exact seven-day cutoff", () => {
  const now = 10 * 24 * 60 * 60_000;
  const cutoff = now - TELEMETRY_RETENTION_MS;
  const retained = retainTelemetryMinutes([
    minute(cutoff - 60_000),
    minute(cutoff),
    minute(now),
  ], now);

  assertEquals(retained.map((entry) => entry.minuteStart), [cutoff, now]);
});

Deno.test("pairing codes use exactly eight Crockford Base32 characters", () => {
  const code = generatePairingCode((length) =>
    Uint8Array.from({ length }, (_, index) => index)
  );

  assertEquals(code, "01234567");
  assertEquals(code.length, 8);
  assert(/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code));
  assertEquals(validatePairingCode(code), true);
  assertEquals(validatePairingCode("OILU1234"), false);
});

Deno.test("relay envelopes seal and open with WebCrypto", async () => {
  const cryptoAdapter = createWebCryptoAdapter(globalThis.crypto);
  const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  const replay = createReplayProtector();
  const envelope = await sealRelayEnvelope(
    cryptoAdapter,
    secret,
    { route: "/v1/system/overview", body: { detail: true } },
    {
      now: () => 1_000_000,
      randomBytes: deterministicRandom,
    },
  );

  assertEquals(
    await openRelayEnvelope(cryptoAdapter, secret, envelope, {
      now: () => 1_000_001,
      replayProtector: replay,
    }),
    { route: "/v1/system/overview", body: { detail: true } },
  );
});

Deno.test("relay envelopes reject ciphertext tampering", async () => {
  const cryptoAdapter = createWebCryptoAdapter(globalThis.crypto);
  const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  const envelope = await sealRelayEnvelope(cryptoAdapter, secret, { ok: true }, {
    now: () => 2_000_000,
    randomBytes: deterministicRandom,
  });

  await assertRejects(
    () =>
      openRelayEnvelope(cryptoAdapter, secret, {
        ...envelope,
        ciphertext: `${envelope.ciphertext[0] === "A" ? "B" : "A"}${
          envelope.ciphertext.slice(1)
        }`,
      }, {
        now: () => 2_000_001,
        replayProtector: createReplayProtector(),
      }),
    Error,
    "node_signature_invalid",
  );
});

Deno.test("relay envelopes reject an authenticated nonce replay", async () => {
  const cryptoAdapter = createWebCryptoAdapter(globalThis.crypto);
  const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  const replay = createReplayProtector();
  const envelope = await sealRelayEnvelope(cryptoAdapter, secret, { ok: true }, {
    now: () => 3_000_000,
    randomBytes: deterministicRandom,
  });
  const options = { now: () => 3_000_001, replayProtector: replay };

  await openRelayEnvelope(cryptoAdapter, secret, envelope, options);
  await assertRejects(
    () => openRelayEnvelope(cryptoAdapter, secret, envelope, options),
    Error,
    "node_replay_detected",
  );
});

Deno.test("signed requests bind method, path, body, timestamp, and nonce", async () => {
  const cryptoAdapter = createWebCryptoAdapter(globalThis.crypto);
  const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
  const signed = await signRequest(
    cryptoAdapter,
    secret,
    { method: "POST", path: "/v1/relay", body: { enabled: true } },
    { now: () => 4_000_000, randomBytes: deterministicRandom },
  );

  assertEquals(
    await verifySignedRequest(cryptoAdapter, secret, signed, {
      now: () => 4_000_001,
      replayProtector: createReplayProtector(),
    }),
    true,
  );
  await assertRejects(
    () =>
      verifySignedRequest(
        cryptoAdapter,
        secret,
        { ...signed, path: "/v1/audit" },
        {
          now: () => 4_000_001,
          replayProtector: createReplayProtector(),
        },
      ),
    Error,
    "node_signature_invalid",
  );
});

function deterministicRandom(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index + length) & 0xff);
}

function sample(
  collectedAt: number,
  cpuUsagePercent: number,
  memoryUsedBytes: number,
  memoryTotalBytes: number,
  diskUsedBytes: number,
  diskTotalBytes: number,
  networkRxBytes: number,
  networkTxBytes: number,
  batteryPercent: number | null,
  processCount: number,
) {
  return {
    collectedAt,
    cpuUsagePercent,
    memoryUsedBytes,
    memoryTotalBytes,
    diskUsedBytes,
    diskTotalBytes,
    networkRxBytes,
    networkTxBytes,
    batteryPercent,
    processCount,
  };
}

function minute(minuteStart: number) {
  return {
    minuteStart,
    sampleCount: 1,
    cpuUsagePercent: 0,
    memoryUsedBytes: 0,
    memoryTotalBytes: 0,
    diskUsedBytes: 0,
    diskTotalBytes: 0,
    networkRxBytes: 0,
    networkTxBytes: 0,
    batteryPercent: null,
    processCount: 0,
  };
}
