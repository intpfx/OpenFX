/**
 * TURN Protocol Handlers
 * =======================
 *
 * Pure functions for handling STUN Binding, TURN Allocate, Refresh,
 * CreatePermission, Send, ChannelBind, and supporting operations.
 *
 * @module turn/handlers
 */

import type {
  Address,
  Allocation,
  StunMessage,
  Transport,
  TurnServerContext,
} from "./types.ts";
import { TransportFamily } from "./types.ts";
import { STUN_CLASS, STUN_METHOD, TRANSPORT_PROTO } from "./constants.ts";
import {
  addressToString,
  createAddress,
  randomBytes,
  randomUint32,
  u8ToHex,
} from "./utils.ts";
import {
  addAttr,
  createReply,
  createStunMessage,
  decodeChannelData,
  encodeChannelData,
  encodeStunMessage,
  getAttr,
  getAttrs,
} from "./stun-codec.ts";
import { authenticate } from "./auth.ts";
import { createUdpSocket } from "./socket.ts";

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

function _getMethodName(method: number): string {
  for (const [k, v] of Object.entries(STUN_METHOD)) {
    if (v === method) return k.toLowerCase();
  }
  return "unknown-method";
}

function _getClassName(cls: number): string {
  for (const [k, v] of Object.entries(STUN_CLASS)) {
    if (v === cls) return k.toLowerCase();
  }
  return "unknown-class";
}

// ---------------------------------------------------------------------------
// Transport helpers
// ---------------------------------------------------------------------------

function _transportToString(t: Transport): string {
  const proto = t.protocol === TRANSPORT_PROTO.UDP ? "UDP" : "UNKNOWN";
  return `${proto}: from ${addressToString(t.src)} to ${addressToString(t.dst)}`;
}

function transportGet5Tuple(t: Transport): string {
  let tup = "";
  tup += t.protocol === TRANSPORT_PROTO.UDP ? "UDP" : "?";
  tup += t.src.family === TransportFamily.IPV4 ? "4" : "6";
  tup += "://" + t.src.address + ":" + t.src.port + ">" + t.dst.address + ":" +
    t.dst.port;
  return tup;
}

function transportRevert(t: Transport): Transport {
  return { ...t, src: t.dst, dst: t.src };
}

// ---------------------------------------------------------------------------
// STUN Binding
// ---------------------------------------------------------------------------

/** Handle STUN Binding request. */
function handleBinding(msg: StunMessage, reply: StunMessage): StunMessage {
  addAttr(reply, "xor-mapped-address", msg.transport.src);
  reply.class = STUN_CLASS.SUCCESS;
  return reply;
}

// ---------------------------------------------------------------------------
// TURN Allocate
// ---------------------------------------------------------------------------

/** Handle Allocate request. */
async function handleAllocate(
  ctx: TurnServerContext,
  msg: StunMessage,
  reply: StunMessage,
): Promise<StunMessage> {
  if (msg.allocation) {
    // Retransmission check
    if (msg.allocation.transactionID === msg.transactionID) {
      // Re-send success response
      addAttr(reply, "xor-relayed-address", msg.allocation.relayedTransportAddress);
      addAttr(reply, "lifetime", msg.allocation.lifetime);
      addAttr(reply, "xor-mapped-address", msg.allocation.mappedAddress);
      addAttr(reply, "software", ctx.software);
      addAttr(reply, "message-integrity");
      reply.class = STUN_CLASS.SUCCESS;
      return reply;
    }
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 437, reason: "Allocation Mismatch" });
    return reply;
  }

  const requestedTransport = getAttr(msg, "requested-transport") as number | undefined;
  if (!requestedTransport) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return reply;
  }
  if (requestedTransport !== TRANSPORT_PROTO.UDP) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", {
      code: 442,
      reason: "Unsupported Transport Protocol",
    });
    return reply;
  }

  const reservationToken = getAttr(msg, "reservation-token") as string | undefined;
  const evenPort = getAttr(msg, "even-port");

  if (reservationToken) {
    if (evenPort !== undefined) {
      reply.class = STUN_CLASS.ERROR;
      addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
      return reply;
    }
    if (!ctx.reservations[reservationToken]) {
      reply.class = STUN_CLASS.ERROR;
      addAttr(reply, "error-code", { code: 508, reason: "Insufficient Capacity" });
      return reply;
    }
  }

  // Check quota (stub — always passes in original)
  // username-based quota check would go here

  // Allocate relay sockets
  let sockets;
  try {
    const ip = getRelayIp(ctx, msg);
    if (reservationToken) {
      sockets = [ctx.reservations[reservationToken].socket];
    } else if (evenPort !== undefined) {
      sockets = await allocateUdpEven(ctx, msg, !!evenPort);
    } else {
      sockets = await allocateUdp(ctx, msg, ip);
    }
  } catch {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 508, reason: "Insufficient Capacity" });
    return reply;
  }

  let lifetime = ctx.defaultAllocateLifetime;
  const reqLifetime = getAttr(msg, "lifetime") as number | undefined;
  if (reqLifetime !== undefined) {
    lifetime = Math.min(reqLifetime, ctx.maxAllocateLifetime);
  }
  if (lifetime < ctx.defaultAllocateLifetime) {
    lifetime = ctx.defaultAllocateLifetime;
  }

  const allocation = createAllocation(ctx, msg, sockets, lifetime);
  msg.allocation = allocation;

  addAttr(reply, "xor-relayed-address", allocation.relayedTransportAddress);
  addAttr(reply, "lifetime", allocation.lifetime);
  addAttr(reply, "xor-mapped-address", allocation.mappedAddress);
  addAttr(reply, "software", ctx.software);
  addAttr(reply, "message-integrity");
  reply.class = STUN_CLASS.SUCCESS;
  return reply;
}

// ---------------------------------------------------------------------------
// TURN Refresh
// ---------------------------------------------------------------------------

/** Handle Refresh request. */
function handleRefresh(
  ctx: TurnServerContext,
  msg: StunMessage,
  reply: StunMessage,
): StunMessage {
  let desiredLifetime = ctx.defaultAllocateLifetime;
  const lifetime = getAttr(msg, "lifetime") as number | undefined;
  if (lifetime !== undefined) {
    desiredLifetime = lifetime === 0 ? 0 : Math.min(lifetime, ctx.maxAllocateLifetime);
  }

  if (desiredLifetime === 0) {
    // Use the allocation's fiveTuple if available, otherwise compute from transport
    const ft = msg.allocation
      ? msg.allocation.fiveTuple
      : transportGet5Tuple(msg.transport);
    delete ctx.allocations[ft];
  } else if (msg.allocation) {
    msg.allocation.lifetime = desiredLifetime;
    if (msg.allocation.timer) clearTimeout(msg.allocation.timer);
    msg.allocation.timer = setTimeout(() => {
      const ft = msg.allocation!.fiveTuple;
      delete ctx.allocations[ft];
    }, desiredLifetime * 1000);
    msg.allocation.timeToExpiry = Date.now() + desiredLifetime * 1000;
  }

  addAttr(reply, "lifetime", desiredLifetime);
  addAttr(reply, "software", ctx.software);
  addAttr(reply, "message-integrity");
  reply.class = STUN_CLASS.SUCCESS;
  return reply;
}

// ---------------------------------------------------------------------------
// TURN CreatePermission
// ---------------------------------------------------------------------------

/** Handle CreatePermission request. */
function handleCreatePermission(
  ctx: TurnServerContext,
  msg: StunMessage,
  reply: StunMessage,
): StunMessage {
  const xorPeers = getAttrs(msg, "xor-peer-address") as Address[];
  if (xorPeers.length === 0) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return reply;
  }

  let badRequest = false;
  for (const peer of xorPeers) {
    if (!peer.address) {
      badRequest = true;
      break;
    }
  }

  if (badRequest) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return reply;
  }

  if (msg.allocation) {
    for (const peer of xorPeers) {
      msg.allocation.permissions[peer.address] = Date.now() + 300_000; // 5 min
    }
  }
  addAttr(reply, "software", ctx.software);
  addAttr(reply, "message-integrity");
  reply.class = STUN_CLASS.SUCCESS;
  return reply;
}

// ---------------------------------------------------------------------------
// TURN Send indication
// ---------------------------------------------------------------------------

/** Handle Send indication. */
function handleSend(_ctx: TurnServerContext, msg: StunMessage): void {
  const dst = getAttr(msg, "xor-peer-address") as Address | undefined;
  const data = getAttr(msg, "data") as Uint8Array | undefined;
  if (!dst || !data) return;

  if (!msg.allocation) return;
  const permission = msg.allocation.permissions[dst.address];
  if (!permission || permission < Date.now()) return;

  const sock = msg.allocation.sockets[0];
  sock.send(data, 0, data.length, dst.port, dst.address).catch(() => {});
}

// ---------------------------------------------------------------------------
// TURN ChannelBind
// ---------------------------------------------------------------------------

/** Handle ChannelBind request. */
function handleChannelBind(
  _ctx: TurnServerContext,
  msg: StunMessage,
  reply: StunMessage,
): StunMessage {
  const channelNumber = getAttr(msg, "channel-number") as number | undefined;
  const peer = getAttr(msg, "xor-peer-address") as Address | undefined;

  if (!channelNumber || !peer) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return reply;
  }

  if (channelNumber < 0x4000 || channelNumber > 0x7FFE) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return reply;
  }

  if (!msg.allocation) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 437, reason: "Allocation Mismatch" });
    return reply;
  }

  const boundChannelNumber = getAllocationPeerChannel(msg.allocation, peer);
  const existingChannel = msg.allocation.channelBindings[channelNumber];

  if (existingChannel && boundChannelNumber !== channelNumber) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return reply;
  }

  if (boundChannelNumber !== undefined && boundChannelNumber !== channelNumber) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return reply;
  }

  // Add permission for the peer
  msg.allocation.permissions[peer.address] = Date.now() + 300_000;
  msg.allocation.channelBindings[channelNumber] = peer;

  reply.class = STUN_CLASS.SUCCESS;
  return reply;
}

// ---------------------------------------------------------------------------
// Allocation management
// ---------------------------------------------------------------------------

function createAllocation(
  ctx: TurnServerContext,
  msg: StunMessage,
  sockets: import("./types.ts").UdpSocket[],
  lifetime: number,
): Allocation {
  const revertedTransport = transportRevert(msg.transport);
  // 5-tuple uses the ORIGINAL (incoming) transport, matching how allocation lookup works
  const ft = transportGet5Tuple(msg.transport);
  const relayAddr = sockets[0].address();
  const relayTransportAddress = getRelayedAddress(
    ctx,
    relayAddr.address,
    relayAddr.port,
  );

  const alloc: Allocation = {
    transactionID: msg.transactionID,
    transport: revertedTransport,
    fiveTuple: ft,
    user: msg.user,
    serverCtx: ctx,
    sockets,
    relayedTransportAddress: relayTransportAddress,
    lifetime,
    mappedAddress: msg.transport.src,
    permissions: {},
    channelBindings: {},
    timeToExpiry: Date.now() + lifetime * 1000,
    timer: null,
  };

  alloc.timer = setTimeout(() => {
    delete ctx.allocations[ft];
  }, lifetime * 1000);

  ctx.allocations[ft] = alloc;

  // Listen for incoming messages on relay sockets
  for (const sock of sockets) {
    sock.on(
      "message",
      ((data: Uint8Array, rinfo: { address: string; port: number }) => {
        const from = createAddress(rinfo.address, rinfo.port);
        const perm = alloc.permissions[from.address];
        if (!perm || perm < Date.now()) {
          return; // no permission, drop
        }

        const channelNumber = getAllocationPeerChannel(alloc, from);
        const channelMsg = decodeChannelData(data);
        let payload = data;
        if (channelMsg) {
          if (channelNumber === undefined) return;
          if (channelNumber !== channelMsg.channelNumber) return;
          payload = channelMsg.data!;
        }

        if (channelNumber !== undefined) {
          // Send as ChannelData to client
          const out = encodeChannelData({
            channelNumber,
            length: payload.length,
            data: payload,
            padding: 0,
          });
          alloc.transport.socket.send(
            out,
            0,
            out.length,
            alloc.transport.dst.port,
            alloc.transport.dst.address,
          ).catch(() => {});
          return;
        }

        // Send as DataIndication
        const ind = createStunMessage(ctx, alloc.transport);
        ind.class = STUN_CLASS.INDICATION;
        ind.method = STUN_METHOD.DATA;
        addAttr(ind, "xor-peer-address", from);
        // Data indication: generate a random transaction ID
        randomBytes(12).then((tid) => {
          ind.transactionID = u8ToHex(tid);
          addAttr(ind, "data", payload);
          const wire = encodeStunMessage(ind);
          alloc.transport.socket.send(
            wire,
            0,
            wire.length,
            alloc.transport.dst.port,
            alloc.transport.dst.address,
          ).catch(() => {});
        }).catch(() => {});
      }) as (...args: unknown[]) => void,
    );
  }

  return alloc;
}

function getAllocationPeerChannel(
  alloc: Allocation,
  peer: Address,
): number | undefined {
  const ps = addressToString(peer);
  for (const [ch, addr] of Object.entries(alloc.channelBindings)) {
    if (addressToString(addr) === ps) return parseInt(ch);
  }
  return undefined;
}

function getRelayedAddress(
  ctx: TurnServerContext,
  relayAddr: string,
  port: number,
): Address {
  let address = relayAddr;
  if (ctx.externalIps) {
    if (typeof ctx.externalIps === "string") {
      address = ctx.externalIps;
    } else {
      address = (ctx.externalIps as Record<string, string>)[relayAddr] ||
        (ctx.externalIps as Record<string, string>).default ||
        relayAddr;
    }
  }
  return createAddress(address, port);
}

function getRelayIp(ctx: TurnServerContext, msg: StunMessage): string {
  if (!ctx.relayIps || ctx.relayIps.length === 0) {
    return msg.transport.dst.address;
  }
  let i = ctx.relayIps.indexOf(ctx.lastRelayIp) + 1;
  if (i >= ctx.relayIps.length) i = 0;
  ctx.lastRelayIp = ctx.relayIps[i];
  return ctx.lastRelayIp;
}

// ---------------------------------------------------------------------------
// UDP relay socket allocation
// ---------------------------------------------------------------------------

async function allocateUdp(
  ctx: TurnServerContext,
  _msg: StunMessage,
  ip: string,
): Promise<import("./types.ts").UdpSocket[]> {
  const family = createAddress(ip, 0).family === TransportFamily.IPV4 ? "udp4" : "udp6";
  const numEphemeral = ctx.maxPort - ctx.minPort + 1;
  const rand = await randomUint32();
  let nextPort = ctx.minPort + (rand % numEphemeral);
  let count = numEphemeral;

  return new Promise<import("./types.ts").UdpSocket[]>((resolve, reject) => {
    const tryBind = () => {
      const sock = createUdpSocket(ctx, family);
      let listening = false;
      sock.on("listening", () => {
        listening = true;
        resolve([sock]);
      });
      sock.on("error", () => {
        if (listening) return;
        count--;
        if (count <= 0) {
          sock.close();
          reject(new Error("no available port in range"));
          return;
        }
        randomUint32().then((r2) => {
          nextPort = ctx.minPort + (r2 % numEphemeral);
          // Create new socket for retry via recursive call
          sock.close();
          tryBind();
        }).catch(reject);
      });
      sock.bind({ address: ip, port: nextPort, exclusive: true });
    };
    tryBind();
  });
}

function allocateUdpEven(
  ctx: TurnServerContext,
  msg: StunMessage,
  rBit: boolean,
): Promise<import("./types.ts").UdpSocket[]> {
  const port1 = msg.transport.src.port;
  if (port1 < ctx.minPort) throw new Error("no available port in range");
  const ip = getRelayIp(ctx, msg);
  const family = createAddress(ip, 0).family === TransportFamily.IPV4 ? "udp4" : "udp6";

  return new Promise<import("./types.ts").UdpSocket[]>((resolve, reject) => {
    let sock1: import("./types.ts").UdpSocket | null = null;
    let sock2: import("./types.ts").UdpSocket | null = null;

    const s1 = createUdpSocket(ctx, family);
    s1.on("listening", () => {
      sock1 = s1;
      if (sock2 || !rBit) resolve([s1].concat(sock2 ? [sock2] : []));
    });
    s1.on("error", (err: unknown) => {
      s1.close();
      if (sock2) sock2.close();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    s1.bind({ address: ip, port: port1, exclusive: true });

    if (rBit) {
      const port2 = port1 + 1;
      if (port2 > ctx.maxPort) return reject(new Error("no available port in range"));
      const s2 = createUdpSocket(ctx, family);
      s2.on("listening", () => {
        sock2 = s2;
        if (sock1) resolve([sock1, s2]);
      });
      s2.on("error", (err: unknown) => {
        s2.close();
        if (sock1) sock1.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
      s2.bind({ address: ip, port: port2, exclusive: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Dispatch / message handler
// ---------------------------------------------------------------------------

function createDispatchHandler(ctx: TurnServerContext): (msg: StunMessage) => void {
  return async (msg: StunMessage) => {
    // Check fingerprint
    if (getAttr(msg, "fingerprint") === false) {
      return; // silently discard
    }

    // STUN Binding doesn't need auth
    if (msg.class === STUN_CLASS.REQUEST && msg.method === STUN_METHOD.BINDING) {
      const reply = createReply(msg);
      const result = handleBinding(msg, reply);
      const wire = encodeStunMessage(result);
      await sendStunMessage(result, wire);
      return;
    }

    // Non-Allocate requests need an existing allocation
    if (msg.class !== STUN_CLASS.REQUEST || msg.method !== STUN_METHOD.ALLOCATE) {
      const ft = transportGet5Tuple(msg.transport);
      const allocation = ctx.allocations[ft];
      if (!allocation) {
        if (msg.class === STUN_CLASS.INDICATION) return; // silently discard
        const reply = createReply(msg);
        reply.class = STUN_CLASS.ERROR;
        addAttr(reply, "error-code", { code: 437, reason: "Allocation Mismatch" });
        const wire = encodeStunMessage(reply);
        await sendStunMessage(reply, wire);
        return;
      }
      msg.allocation = allocation;
    }

    // Indications can't be authenticated
    if (msg.class === STUN_CLASS.INDICATION) {
      if (msg.method === STUN_METHOD.SEND) {
        handleSend(ctx, msg);
      }
      return;
    }

    // Authenticate
    const authResult = authenticate(ctx, msg);
    if (!authResult.ok) {
      if (authResult.reply.class === STUN_CLASS.ERROR) {
        const wire = encodeStunMessage(authResult.reply);
        await sendStunMessage(authResult.reply, wire);
      }
      return;
    }

    const reply = authResult.reply;

    // Dispatch by method
    switch (msg.method) {
      case STUN_METHOD.ALLOCATE: {
        const result = await handleAllocate(ctx, msg, reply);
        const wire = encodeStunMessage(result);
        await sendStunMessage(result, wire);
        break;
      }
      case STUN_METHOD.REFRESH: {
        const result = handleRefresh(ctx, msg, reply);
        const wire = encodeStunMessage(result);
        await sendStunMessage(result, wire);
        break;
      }
      case STUN_METHOD.CREATE_PERMISSION: {
        const result = handleCreatePermission(ctx, msg, reply);
        const wire = encodeStunMessage(result);
        await sendStunMessage(result, wire);
        break;
      }
      case STUN_METHOD.CHANNEL_BIND: {
        const result = handleChannelBind(ctx, msg, reply);
        const wire = encodeStunMessage(result);
        await sendStunMessage(result, wire);
        break;
      }
      default: {
        const wire = encodeStunMessage(reply);
        await sendStunMessage(reply, wire);
        break;
      }
    }
  };
}

async function sendStunMessage(msg: StunMessage, wire: Uint8Array): Promise<void> {
  const t = msg.transport;
  await t.socket.send(wire, 0, wire.length, t.dst.port, t.dst.address);
}

// ---------------------------------------------------------------------------
// Exported helpers (for mod.ts)
// ---------------------------------------------------------------------------

export function getTransport5Tuple(t: Transport): string {
  return transportGet5Tuple(t);
}

export { createDispatchHandler, sendStunMessage };
