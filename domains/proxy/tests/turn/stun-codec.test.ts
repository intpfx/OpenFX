import { expect } from "@std/expect";

import {
  createStunMessage,
  decodeStunMessage,
  encodeStunMessage,
  addAttr,
  getAttr,
  createReply,
  decodeChannelData,
  encodeChannelData,
  computeMessageIntegrityRaw,
} from "../../server/turn/stun-codec.ts";
import { authenticate } from "../../server/turn/auth.ts";
import { makeAddress, makeTransport, computeFiveTuple } from "../../server/turn/mod.ts";
import type { TurnServerContext, Address } from "../../server/turn/types.ts";
import { STUN_METHOD, STUN_CLASS } from "../../server/turn/constants.ts";
import { createAddress, crc32 } from "../../server/turn/utils.ts";

// ─── Test context / helpers ──────────────────────────────────────────

const TEST_TRANSACTION = "b9e1b7c2d3e4f5a6b7c8d9e0";

const mockCtx: TurnServerContext = {
  config: {
    debugLevel: "NONE",
    software: "openfx-turn-test",
    realm: "test.realm",
  },
  authMech: "none",
  allocations: {},
  reservations: {} as any,
  nonceMap: new Map(),
  log: () => {},
  debug: () => {},
};

const mockTransport = () => ({
  protocol: 17,
  src: { family: 1, address: "10.0.0.1", port: 34567 },
  dst: { family: 1, address: "10.0.0.2", port: 3478 },
  socket: null as any,
});

// ─── Basic message creation ──────────────────────────────────────────

Deno.test("createStunMessage has correct defaults", () => {
  const msg = createStunMessage(mockCtx, mockTransport());
  expect(msg.attributes).toEqual([]);
  expect(typeof msg.transactionID).toBe("string");
  expect(msg.magicCookie).toBe(0x2112a442);
});

// ─── STUN message encode/decode roundtrip ────────────────────────────

Deno.test("STUN message roundtrip — binding request", () => {
  const msg = createStunMessage(mockCtx, mockTransport());
  msg.transactionID = TEST_TRANSACTION;
  msg.class = 0; // REQUEST
  msg.method = STUN_METHOD.BINDING;

  const encoded = encodeStunMessage(msg);
  const decoded = decodeStunMessage(mockCtx, mockTransport(), encoded);

  expect(decoded).not.toBeNull();
  if (!decoded) return;
  expect(decoded.method).toBe(STUN_METHOD.BINDING);
  expect(decoded.class).toBe(0);
  expect(decoded.transactionID).toBe(TEST_TRANSACTION);
});

Deno.test("STUN message roundtrip — string attributes roundtrip", () => {
  const msg = createStunMessage(mockCtx, mockTransport());
  msg.transactionID = TEST_TRANSACTION;

  addAttr(msg, "software", "openfx-turn");

  const encoded = encodeStunMessage(msg);
  const decoded = decodeStunMessage(mockCtx, mockTransport(), encoded);

  expect(decoded).not.toBeNull();
  if (!decoded) return;
  expect(getAttr(decoded, "software")).toBe("openfx-turn");
});

Deno.test("STUN message roundtrip — XOR mapped address", () => {
  const msg = createStunMessage(mockCtx, mockTransport());
  msg.transactionID = TEST_TRANSACTION;

  const addr = createAddress("192.168.1.1", 54321);
  addAttr(msg, "xor-mapped-address", addr);

  const encoded = encodeStunMessage(msg);
  const decoded = decodeStunMessage(mockCtx, mockTransport(), encoded);

  expect(decoded).not.toBeNull();
  if (!decoded) return;
  const decodedAddr = getAttr(decoded, "xor-mapped-address") as Address;
  expect(decodedAddr).not.toBeNull();
  expect(decodedAddr.address).toBe("192.168.1.1");
  expect(decodedAddr.port).toBe(54321);
});

Deno.test("STUN message roundtrip — multiple attributes", () => {
  const msg = createStunMessage(mockCtx, mockTransport());
  msg.transactionID = TEST_TRANSACTION;

  addAttr(msg, "software", "openfx-turn");
  addAttr(msg, "username", "alice");

  const encoded = encodeStunMessage(msg);
  const decoded = decodeStunMessage(mockCtx, mockTransport(), encoded);

  expect(decoded).not.toBeNull();
  if (!decoded) return;
  expect(getAttr(decoded, "software")).toBe("openfx-turn");
  expect(getAttr(decoded, "username")).toBe("alice");
});

// ─── Null/invalid input handling ─────────────────────────────────────

Deno.test("decodeStunMessage returns null for empty data", () => {
  const result = decodeStunMessage(mockCtx, mockTransport(), new Uint8Array(0));
  expect(result).toBeNull();
});

Deno.test("decodeStunMessage returns null for short data", () => {
  const result = decodeStunMessage(mockCtx, mockTransport(), new Uint8Array(10));
  expect(result).toBeNull();
});

Deno.test("decodeStunMessage returns null for non-STUN data (no magic cookie)", () => {
  const buf = new Uint8Array(20);
  const result = decodeStunMessage(mockCtx, mockTransport(), buf);
  expect(result).toBeNull();
});

Deno.test("decodeStunMessage returns null for data with invalid high bits", () => {
  const buf = new Uint8Array(20);
  buf[0] = 0xc0; // Top 2 bits set — invalid for STUN
  const result = decodeStunMessage(mockCtx, mockTransport(), buf);
  expect(result).toBeNull();
});

// ─── createReply ─────────────────────────────────────────────────────

Deno.test("createReply copies transactionID and method", () => {
  const req = createStunMessage(mockCtx, mockTransport());
  req.transactionID = TEST_TRANSACTION;
  req.method = STUN_METHOD.BINDING;
  req.class = 0; // REQUEST

  const res = createReply(req);
  expect(res.transactionID).toBe(TEST_TRANSACTION);
  expect(res.method).toBe(STUN_METHOD.BINDING);
});

// ─── ChannelData roundtrip ──────────────────────────────────────────

Deno.test("ChannelData encode/decode roundtrip", () => {
  const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
  const cd = {
    channelNumber: 0x4001,
    data,
    length: data.length,
    padding: 0,
  };

  const encoded = encodeChannelData(cd);
  const decoded = decodeChannelData(encoded);

  expect(decoded).not.toBeNull();
  if (!decoded) return;
  expect(decoded.channelNumber).toBe(0x4001);
  expect(decoded.data).toEqual(data);
});

Deno.test("ChannelData handles zero-length data", () => {
  const cd = {
    channelNumber: 0x4001,
    data: new Uint8Array(0),
    length: 0,
    padding: 0,
  };

  const encoded = encodeChannelData(cd);
  const decoded = decodeChannelData(encoded);

  expect(decoded).not.toBeNull();
  if (!decoded) return;
  expect(decoded.channelNumber).toBe(0x4001);
  expect(decoded.data.length).toBe(0);
});

Deno.test("ChannelData padding is correctly computed", () => {
  const data = new Uint8Array([0x01, 0x02, 0x03]); // 3 bytes → needs 1 padding
  const cd = {
    channelNumber: 0x4001,
    data,
    length: data.length,
    padding: 0,
  };

  const encoded = encodeChannelData(cd);
  // Length field should be 3, but total packet should be 4+3+1 = 8 bytes
  expect(encoded.length).toBe(8);
});

Deno.test("ChannelData rejects invalid channel number (below 0x4000)", () => {
  const cd = {
    channelNumber: 0x3fff,
    data: new Uint8Array([0x00]),
    length: 1,
    padding: 0,
  };

  const encoded = encodeChannelData(cd);
  const decoded = decodeChannelData(encoded);
  expect(decoded).toBeNull();
});

Deno.test("ChannelData rejects invalid channel number (above 0x7FFE)", () => {
  const cd = {
    channelNumber: 0x7fff,
    data: new Uint8Array([0x00]),
    length: 1,
    padding: 0,
  };

  const encoded = encodeChannelData(cd);
  const decoded = decodeChannelData(encoded);
  expect(decoded).toBeNull();
});

// ─── Auth ────────────────────────────────────────────────────────────

Deno.test("authenticate returns ok for none authMech", () => {
  const result = authenticate(mockCtx, createStunMessage(mockCtx, mockTransport()));
  expect(result.ok).toBe(true);
});

Deno.test("authenticated result includes a reply", () => {
  const result = authenticate(mockCtx, createStunMessage(mockCtx, mockTransport()));
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.reply.transactionID).toBeDefined();
  }
});

// ─── Value objects ──────────────────────────────────────────────────

Deno.test("makeAddress creates correct value object", () => {
  const addr = makeAddress("10.0.0.1", 3478);
  expect(addr.address).toBe("10.0.0.1");
  expect(addr.port).toBe(3478);
  expect(addr.family).toBe(1);
});

Deno.test("computeFiveTuple produces deterministic key", () => {
  const t = mockTransport();
  const key = computeFiveTuple(t);
  expect(typeof key).toBe("string");
  expect(key.length).toBeGreaterThan(0);
  expect(computeFiveTuple(t)).toBe(key);
});

Deno.test("computeFiveTuple distinguishes different tuples", () => {
  const t1 = mockTransport();
  const t2 = mockTransport();
  t2.src = { ...t2.src, port: 34568 };

  expect(computeFiveTuple(t1)).not.toBe(computeFiveTuple(t2));
});

// ─── Message integrity (stateless) ──────────────────────────────────

Deno.test("message integrity requires user and throws", () => {
  const msg = createStunMessage(mockCtx, mockTransport());
  msg.transactionID = TEST_TRANSACTION;
  addAttr(msg, "username", "testuser");
  addAttr(msg, "message-integrity");

  expect(() => {
    // Will fail because msg.user is null
    computeMessageIntegrityRaw(msg);
  }).toThrow();
});

// ─── STUN constants sanity ──────────────────────────────────────────

Deno.test("STUN protocol constants are well-defined", () => {
  expect(STUN_METHOD.BINDING).toBe(0x01);
  expect(STUN_METHOD.ALLOCATE).toBe(0x03);
  expect(STUN_METHOD.REFRESH).toBe(0x04);
  expect(STUN_METHOD.SEND).toBe(0x06);
  expect(STUN_METHOD.CHANNEL_BIND).toBe(0x09);
  expect(STUN_METHOD.CREATE_PERMISSION).toBe(0x08);
});

// ─── addAttr / getAttr edge cases ───────────────────────────────────

Deno.test("getAttr returns undefined for missing attribute", () => {
  const msg = createStunMessage(mockCtx, mockTransport());
  expect(getAttr(msg, "nonexistent")).toBeUndefined();
});
