/**
 * STUN Message & Attribute Codec
 * ===============================
 *
 * Pure functions for encoding/decoding STUN messages, attributes,
 * and ChannelData messages (RFC 5389 / RFC 5766).
 *
 * @module turn/stun-codec
 */

import type {
  Address,
  ChannelData,
  StunMessage,
  Transport,
  TurnServerContext,
} from "./types.ts";
import { TransportFamily } from "./types.ts";
import { MAGIC_COOKIE, STUN_ATTR } from "./constants.ts";
import {
  crc32,
  createAddress,
  readBit,
  readInt16BE,
  readUInt16BE,
  readUInt32BE,
  readUncontiguous,
  u8alloc,
  u8Concat,
  u8FromHex,
  u8FromUtf8,
  u8ToHex,
  u8ToUtf8,
  writeBit,
  writeInt16BE,
  writeUInt16BE,
  writeUInt32BE,
  writeUncontiguous,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Internal message state
// ---------------------------------------------------------------------------

const MSG_STATE = {
  WAITING: 0,
  RESOLVED: 1,
  REJECTED: 2,
  DISCARDED: 3,
  INCOMMING: 4,
} as const;

// ---------------------------------------------------------------------------
// Attribute name/type mapping
// ---------------------------------------------------------------------------

/** Map attribute name (kebab-case) to type code. */
function attrNameToType(name: string): number {
  const key = name.replace(/-/g, "_").toUpperCase() as keyof typeof STUN_ATTR;
  const type = STUN_ATTR[key];
  if (type === undefined) throw new Error(`invalid attribute name: ${name}`);
  return type;
}

/** Map attribute type code to name. */
function attrTypeToName(type: number): string {
  for (const [k, v] of Object.entries(STUN_ATTR)) {
    if (v === type) return k.replace(/_/g, "-").toLowerCase();
  }
  return `unknown-0x${type.toString(16)}`;
}

/** Determine the wire length of an attribute value given its type and value. */
function attrWireLength(type: number, value: unknown): number {
  switch (type) {
    case STUN_ATTR.MAPPED_ADDRESS:
    case STUN_ATTR.XOR_MAPPED_ADDRESS:
    case STUN_ATTR.XOR_PEER_ADDRESS:
    case STUN_ATTR.XOR_RELAYED_ADDRESS:
      return (value as Address).family === TransportFamily.IPV6 ? 20 : 8;
    case STUN_ATTR.USERNAME:
    case STUN_ATTR.REALM:
    case STUN_ATTR.NONCE:
    case STUN_ATTR.SOFTWARE:
      return (value as string).length;
    case STUN_ATTR.MESSAGE_INTEGRITY:
      return 20;
    case STUN_ATTR.ERROR_CODE: {
      const r = (value as { code: number; reason: string }).reason;
      return 4 + r.length;
    }
    case STUN_ATTR.UNKNOWN_ATTRIBUTES:
      return 2;
    case STUN_ATTR.FINGERPRINT:
    case STUN_ATTR.CHANNEL_NUMBER:
    case STUN_ATTR.LIFETIME:
    case STUN_ATTR.REQUESTED_TRANSPORT:
      return 4;
    case STUN_ATTR.DATA:
      return (value as Uint8Array).length;
    case STUN_ATTR.EVEN_PORT:
      return 1;
    case STUN_ATTR.DONT_FRAGMENT:
      return 0;
    case STUN_ATTR.RESERVATION_TOKEN:
      return 8;
    default:
      throw new Error(`invalid type 0x${type.toString(16)}`);
  }
}

/** Compute padding for a 4-byte aligned attribute. */
function attrPadding(length: number): number {
  return length % 4 ? 4 - (length % 4) : 0;
}

// ---------------------------------------------------------------------------
// Attribute value encode / decode
// ---------------------------------------------------------------------------

/** Decode an attribute value from wire bytes. */
function decodeAttrValue(
  type: number,
  data: Uint8Array,
  length: number,
  msg: StunMessage,
): unknown {
  switch (type) {
    case STUN_ATTR.ALTERNATE_SERVER:
    case STUN_ATTR.ERROR_CODE:
    case STUN_ATTR.LIFETIME:
    case STUN_ATTR.MAPPED_ADDRESS:
    case STUN_ATTR.FINGERPRINT:
    case STUN_ATTR.RESERVATION_TOKEN:
    case STUN_ATTR.UNKNOWN_ATTRIBUTES:
      return data.slice(4, 4 + length);

    case STUN_ATTR.CHANNEL_NUMBER:
      return readUInt16BE(data, 4);

    case STUN_ATTR.DATA:
      return data.slice(4, 4 + length);

    case STUN_ATTR.DONT_FRAGMENT:
      return true;

    case STUN_ATTR.EVEN_PORT:
      return readBit(data, 32);

    case STUN_ATTR.MESSAGE_INTEGRITY:
      return u8ToHex(data, 4, 4 + length);

    case STUN_ATTR.NONCE:
    case STUN_ATTR.REALM:
    case STUN_ATTR.SOFTWARE:
    case STUN_ATTR.USERNAME:
      return u8ToUtf8(data, 4, 4 + length);

    case STUN_ATTR.REQUESTED_TRANSPORT:
      return data[4];

    case STUN_ATTR.XOR_MAPPED_ADDRESS:
    case STUN_ATTR.XOR_PEER_ADDRESS:
    case STUN_ATTR.XOR_RELAYED_ADDRESS: {
      const family = data[5];
      const xport = readUInt16BE(data, 6);
      const port = xport ^ (msg.magicCookie >> 16);
      if (family === TransportFamily.IPV4) {
        const mcBuf = new Uint8Array(4);
        writeUInt32BE(mcBuf, msg.magicCookie, 0);
        const addr = `${data[8] ^ mcBuf[0]}.${data[9] ^ mcBuf[1]}.${
          data[10] ^ mcBuf[2]
        }.${data[11] ^ mcBuf[3]}`;
        return createAddress(addr, port);
      } else {
        const key = new Uint8Array(16);
        writeUInt32BE(key, msg.magicCookie, 0);
        const tidHex = msg.transactionID;
        const tid = u8FromHex(tidHex);
        key.set(tid, 4);
        const parts: string[] = [];
        for (let i = 0; i < 8; i++) {
          const wire = readUInt16BE(data, 8 + i * 2);
          const k = readUInt16BE(key, i * 2);
          parts.push((wire ^ k).toString(16));
        }
        return createAddress(parts.join(":"), port);
      }
    }

    default:
      throw new Error(`Invalid Attribute type 0x${type.toString(16)}`);
  }
}

/** Encode an attribute value into wire bytes (Uint8Array of exact length). */
function encodeAttrValue(type: number, value: unknown, msg: StunMessage): Uint8Array {
  const len = attrWireLength(type, value);
  const out = u8alloc(len);

  switch (type) {
    case STUN_ATTR.MAPPED_ADDRESS: {
      const addr = value as Address;
      out[1] = addr.family;
      writeUInt16BE(out, addr.port, 2);
      const parts = addr.address.split(".");
      for (let i = 0; i < 4; i++) out[4 + i] = parseInt(parts[i]);
      return out;
    }

    case STUN_ATTR.USERNAME:
    case STUN_ATTR.REALM:
    case STUN_ATTR.NONCE:
    case STUN_ATTR.SOFTWARE: {
      const enc = u8FromUtf8(value as string);
      out.set(enc);
      return out;
    }

    case STUN_ATTR.MESSAGE_INTEGRITY: {
      // Must be computed after raw header is built, see toBuffer logic
      return out; // placeholder — caller fills via computeMessageIntegrity
    }

    case STUN_ATTR.ERROR_CODE: {
      const ec = value as { code: number; reason: string };
      if (ec.code < 300 || ec.code > 699) throw new Error("invalid error code");
      if (ec.reason.length > 128) throw new Error("reason too long");
      const errClass = Math.floor(ec.code / 100);
      const errNum = ec.code % 100;
      writeUncontiguous(out, errClass, [21, 22, 23]);
      out[3] = errNum;
      const reasonEnc = u8FromUtf8(ec.reason);
      out.set(reasonEnc, 4);
      return out;
    }

    case STUN_ATTR.UNKNOWN_ATTRIBUTES:
      writeUInt16BE(out, value as number, 0);
      return out;

    case STUN_ATTR.XOR_MAPPED_ADDRESS:
    case STUN_ATTR.XOR_PEER_ADDRESS:
    case STUN_ATTR.XOR_RELAYED_ADDRESS: {
      const addr = value as Address;
      out[1] = addr.family;
      writeUInt16BE(out, addr.port ^ (msg.magicCookie >> 16), 2);
      if (addr.family === TransportFamily.IPV4) {
        const mcBuf = new Uint8Array(4);
        writeUInt32BE(mcBuf, msg.magicCookie, 0);
        const octets = addr.address.split(".");
        for (let i = 0; i < 4; i++) {
          out[4 + i] = (parseInt(octets[i]) & 0xff) ^ mcBuf[i];
        }
      } else {
        const key = new Uint8Array(16);
        writeUInt32BE(key, msg.magicCookie, 0);
        key.set(u8FromHex(msg.transactionID), 4);
        const parts = addr.address.split(":");
        for (let i = 0; i < 8; i++) {
          writeUInt16BE(
            out,
            parseInt(parts[i], 16) ^ readUInt16BE(key, i * 2),
            i * 2 + 4,
          );
        }
      }
      return out;
    }

    case STUN_ATTR.FINGERPRINT: {
      writeUInt32BE(out, crc32(msg.raw), 0);
      const xor = new Uint8Array(4);
      writeUInt32BE(xor, 0x5354554e, 0);
      for (let i = 0; i < 4; i++) out[i] = (out[i] & 0xff) ^ xor[i];
      return out;
    }

    case STUN_ATTR.CHANNEL_NUMBER:
    case STUN_ATTR.LIFETIME:
      writeUInt32BE(out, value as number, 0);
      return out;

    case STUN_ATTR.DATA:
      return value as Uint8Array;

    case STUN_ATTR.EVEN_PORT:
      if (value) out[0] = 0x80;
      return out;

    case STUN_ATTR.REQUESTED_TRANSPORT:
      out[0] = value as number;
      return out;

    case STUN_ATTR.DONT_FRAGMENT:
      return out;

    case STUN_ATTR.RESERVATION_TOKEN:
      out.set(value as Uint8Array);
      return out;

    default:
      throw new Error(`invalid type 0x${type.toString(16)}`);
  }
}

// ---------------------------------------------------------------------------
// STUN message encode / decode
// ---------------------------------------------------------------------------

/** Create a new empty StunMessage. */
export function createStunMessage(
  serverCtx: TurnServerContext,
  transport: Transport,
): StunMessage {
  return {
    serverCtx,
    transport,
    allocation: null,
    class: 0,
    method: 0,
    useFingerprint: false,
    length: 0,
    raw: u8alloc(0),
    attributes: [],
    magicCookie: MAGIC_COOKIE,
    transactionID: "",
    user: null,
    state: MSG_STATE.WAITING,
    debugLevel: serverCtx.debugLevel,
  };
}

/** Decode a STUN message from raw UDP bytes. Returns null if invalid. */
export function decodeStunMessage(
  serverCtx: TurnServerContext,
  transport: Transport,
  udpMessage: Uint8Array,
): StunMessage | null {
  const msg = createStunMessage(serverCtx, transport);
  msg.state = MSG_STATE.INCOMMING;

  if (!udpMessage || udpMessage.length < 20) return null;

  // The most significant 2 bits must be zeroes (STUN/TURN)
  if (readBit(udpMessage, 0) || readBit(udpMessage, 1)) return null;

  msg.class = readUncontiguous(udpMessage, [7, 11]); // C1 (bit7), C0 (bit11)
  msg.method = readUncontiguous(udpMessage, [2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15]);

  const messageLength = readInt16BE(udpMessage, 2);
  if (messageLength + 20 > udpMessage.length) {
    throw new Error("invalid STUN message length");
  }

  msg.magicCookie = readUInt32BE(udpMessage, 4);
  if (msg.magicCookie !== MAGIC_COOKIE) return null;

  msg.transactionID = u8ToHex(udpMessage, 8, 20);

  // Parse attributes
  let attrBuf = udpMessage.slice(20);
  while (attrBuf.length >= 4) {
    const attrType = readUInt16BE(attrBuf, 0);
    const attrLen = readUInt16BE(attrBuf, 2);
    const pad = attrPadding(attrLen);

    if (4 + attrLen + pad > attrBuf.length) break;

    const attrValueRaw = attrBuf.slice(0, 4 + attrLen + pad);
    let value: unknown = decodeAttrValue(attrType, attrValueRaw, attrLen, msg);

    // Special handling: MESSAGE-INTEGRITY verification
    if (attrType === STUN_ATTR.MESSAGE_INTEGRITY) {
      const hmacInput = udpMessage.slice(0, 20 + msg.length);
      const username = getAttr(msg, "username");
      if (!username) {
        value = false;
      } else {
        const password = serverCtx.staticCredentials[username as string];
        if (!password) {
          value = false;
        } else {
          // MD5 key: username:realm:password
          const hmacKey = md5Hash(
            `${username as string}:${serverCtx.realm}:${password}`,
          );
          // Temporarily patch message length for HMAC computation
          const prevLen = readInt16BE(hmacInput, 2);
          writeInt16BE(hmacInput, msg.length + 24, 2);
          const computed = hmacSha1Hex(hmacKey, hmacInput);
          writeInt16BE(hmacInput, prevLen, 2);
          if (computed !== (value as string)) {
            value = false;
          }
        }
      }
    }

    // Special handling: FINGERPRINT verification
    if (attrType === STUN_ATTR.FINGERPRINT) {
      msg.useFingerprint = true;
      const toHash = udpMessage.slice(0, 20 + msg.length);
      const fpBuf = new Uint8Array(4);
      writeUInt32BE(fpBuf, crc32(toHash), 0);
      const xorBuf = new Uint8Array(4);
      writeUInt32BE(xorBuf, 0x5354554e, 0);
      for (let i = 0; i < 4; i++) fpBuf[i] = (fpBuf[i] & 0xff) ^ xorBuf[i];
      if (readUInt32BE(fpBuf, 0) !== readUInt32BE(attrValueRaw, 4)) {
        value = false;
      }
    }

    const name = attrTypeToName(attrType);
    msg.attributes.push({ type: attrType, name, length: attrLen, padding: pad, value });
    msg.length += 4 + attrLen + pad;
    attrBuf = attrBuf.slice(4 + attrLen + pad);
  }

  return msg;
}

/** Build wire bytes from a StunMessage. */
export function encodeStunMessage(msg: StunMessage): Uint8Array {
  // Add fingerprint if originally present
  if (msg.useFingerprint) {
    addAttr(msg, "fingerprint");
  }

  const header = u8alloc(20);
  writeBit(header, false, 0);
  writeBit(header, false, 1);
  writeUncontiguous(header, msg.method, [2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15]);
  writeUncontiguous(header, msg.class, [7, 11]);
  writeInt16BE(header, msg.length, 2);
  writeUInt32BE(header, msg.magicCookie, 4);
  const tidBytes = u8FromHex(msg.transactionID);
  header.set(tidBytes, 8);

  msg.raw = header;
  const parts: Uint8Array[] = [header];

  for (const attr of msg.attributes) {
    const attrHeader = u8alloc(4);
    writeUInt16BE(attrHeader, attr.type, 0);
    writeUInt16BE(attrHeader, attr.length, 2);

    let attrValueBytes: Uint8Array;
    if (attr.type === STUN_ATTR.MESSAGE_INTEGRITY && msg.user) {
      // Compute HMAC after raw is ready
      attrValueBytes = computeMessageIntegrityRaw(msg);
    } else {
      attrValueBytes = encodeAttrValue(attr.type, attr.value, msg);
    }

    const padding = u8alloc(attr.padding);
    parts.push(attrHeader, attrValueBytes, padding);
  }

  msg.raw = u8Concat(parts);
  return msg.raw;
}

/** Compute the MESSAGE-INTEGRITY value and return its 20-byte HMAC-SHA1. */
export function computeMessageIntegrityRaw(msg: StunMessage): Uint8Array {
  if (!msg.user) throw new Error("MESSAGE_INTEGRITY requires a user");
  const keyStr = `${msg.user.username}:${msg.serverCtx.realm}:${msg.user.password}`;
  const hmacKey = md5Hash(keyStr);

  let input: Uint8Array;
  if (msg.useFingerprint) {
    // Adjust length: subtract fingerprint attribute (8 bytes)
    const prev = readInt16BE(msg.raw, 2);
    writeInt16BE(msg.raw, prev - 8, 2);
    input = msg.raw.slice();
    writeInt16BE(msg.raw, prev, 2); // restore
  } else {
    input = msg.raw;
  }
  return hmacSha1Raw(hmacKey, input);
}

/** Create a reply StunMessage for a given incoming message. */
export function createReply(msg: StunMessage): StunMessage {
  const reply = createStunMessage(
    msg.serverCtx,
    { ...msg.transport, src: msg.transport.dst, dst: msg.transport.src },
  );
  reply.class = msg.class;
  reply.method = msg.method;
  reply.magicCookie = msg.magicCookie;
  reply.transactionID = msg.transactionID;
  reply.useFingerprint = msg.useFingerprint;
  reply.user = msg.user;
  return reply;
}

// ---------------------------------------------------------------------------
// Helper: get / add attributes on StunMessage
// ---------------------------------------------------------------------------

export function getAttr(msg: StunMessage, name: string): unknown {
  const key = name.replace(/-/g, "_").toUpperCase() as keyof typeof STUN_ATTR;
  const type = STUN_ATTR[key];
  for (const attr of msg.attributes) {
    if (attr.type === type && attr.value !== undefined) return attr.value;
  }
  return undefined;
}

export function getAttrs(msg: StunMessage, name: string): unknown[] {
  const key = name.replace(/-/g, "_").toUpperCase() as keyof typeof STUN_ATTR;
  const type = STUN_ATTR[key];
  return msg.attributes.filter((a) => a.type === type).map((a) => a.value);
}

export function addAttr(msg: StunMessage, name: string, value?: unknown): void {
  if (!name) throw new Error("addAttr requires a name");
  if (name === "message-integrity" && !msg.user) return;

  const type = attrNameToType(name);
  const len = value !== undefined ? attrWireLength(type, value) : 0;
  const pad = attrPadding(len);
  const attrName = attrTypeToName(type);

  msg.attributes.push({
    type,
    name: attrName,
    length: len,
    padding: pad,
    value: value ?? null,
  });
  msg.length += 4 + len + pad;
}

// ---------------------------------------------------------------------------
// Crypto helpers (Node crypto / Web Crypto)
// ---------------------------------------------------------------------------

async function _computeMd5(input: string): Promise<Uint8Array> {
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("MD5", enc);
  return new Uint8Array(hash);
}

function md5Hash(input: string): Uint8Array {
  // Synchronous fallback using Node.js Buffer if available
  if (typeof require !== "undefined") {
    try {
      const { createHash } = require("node:crypto") as typeof import("node:crypto");
      return createHash("md5").update(input).digest() as Uint8Array;
    } catch {
      // fall through
    }
  }
  // Deno compatible: use sync text encode + polyfill note
  throw new Error("MD5 sync not available; use async init or Node.js");
}

async function _md5HashAsync(input: string): Promise<Uint8Array> {
  if (typeof require !== "undefined") {
    try {
      const { createHash } = require("node:crypto") as typeof import("node:crypto");
      return createHash("md5").update(input).digest() as Uint8Array;
    } catch {
      // fall through
    }
  }
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("MD5", enc);
  return new Uint8Array(hash);
}

function hmacSha1Hex(key: Uint8Array, data: Uint8Array): string {
  if (typeof require !== "undefined") {
    try {
      const { createHmac } = require("node:crypto") as typeof import("node:crypto");
      return createHmac("sha1", Buffer.from(key.buffer, key.byteOffset, key.byteLength))
        .update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
        .digest("hex") as string;
    } catch {
      // fall through
    }
  }
  throw new Error("HMAC-SHA1 sync not available");
}

function hmacSha1Raw(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (typeof require !== "undefined") {
    try {
      const { createHmac } = require("node:crypto") as typeof import("node:crypto");
      return createHmac("sha1", Buffer.from(key.buffer, key.byteOffset, key.byteLength))
        .update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
        .digest() as Uint8Array;
    } catch {
      // fall through
    }
  }
  throw new Error("HMAC-SHA1 sync not available");
}

// ---------------------------------------------------------------------------
// ChannelData message encode/decode
// ---------------------------------------------------------------------------

/** Try to parse a ChannelData from raw bytes. Returns null if not a channel message. */
export function decodeChannelData(data: Uint8Array): ChannelData | null {
  if (data.length < 4) return null;
  const ch = readUInt16BE(data, 0);
  if (ch < 0x4000 || ch > 0x7FFE) return null;
  const len = readUInt16BE(data, 2);
  if (len > data.length - 4) return null;
  const pad = data.length - len - 4;
  if (pad > 3) return null;
  return {
    channelNumber: ch,
    length: len,
    data: data.slice(4, 4 + len),
    padding: pad,
  };
}

/** Encode a ChannelData message to wire bytes. */
export function encodeChannelData(cd: ChannelData): Uint8Array {
  if (!cd.channelNumber) throw new Error("ChannelData requires channelNumber");
  if (!cd.data) throw new Error("ChannelData requires data");
  const header = u8alloc(4);
  writeUInt16BE(header, cd.channelNumber, 0);
  writeUInt16BE(header, cd.length, 2);
  const pad = cd.length % 4 ? 4 - (cd.length % 4) : 0;
  const padding = u8alloc(pad);
  return u8Concat([header, cd.data, padding]);
}
