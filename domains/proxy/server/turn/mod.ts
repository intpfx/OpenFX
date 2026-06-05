/**
 * TURN/STUN Relay Server — Module Entry
 * =======================================
 *
 * Re-exports all public symbols and provides the `createTurnServer` factory.
 *
 * @module turn/mod
 */

import type {
  Address,
  StunMessage,
  Transport,
  TurnServerConfig,
  TurnServerContext,
  TurnServerHandle,
} from "./types.ts";
import { TransportFamily } from "./types.ts";
import { DEBUG_LEVEL, TRANSPORT_PROTO } from "./constants.ts";
import { createAddress } from "./utils.ts";
import { createUdpSocket } from "./socket.ts";
import { decodeStunMessage, encodeStunMessage } from "./stun-codec.ts";
import { createDispatchHandler, getTransport5Tuple } from "./handlers.ts";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  Address,
  Allocation,
  ChannelData,
  StunAttribute,
  StunMessage,
  Transport,
  TurnServerConfig,
  TurnServerContext,
  TurnServerHandle,
  UdpListener,
  UdpSocket,
  User,
} from "./types.ts";

export {
  DEBUG_LEVEL,
  MAGIC_COOKIE,
  STUN_ATTR,
  STUN_CLASS,
  STUN_METHOD,
  TRANSPORT_PROTO,
} from "./constants.ts";

export { TransportFamily } from "./types.ts";

// ---------------------------------------------------------------------------
// createTurnServer — public entry point
// ---------------------------------------------------------------------------

/**
 * Create a TURN/STUN relay server.
 *
 * @param config - Server configuration.
 * @returns A control handle with `start()`, `stop()`, `addUser()`, `removeUser()`.
 *
 * @example
 * ```ts
 * import { createTurnServer } from './turn-relay.ts';
 *
 * const server = createTurnServer({
 *   listeningPort: 3478,
 *   authMech: 'long-term',
 *   credentials: { user: 'pass' },
 *   realm: 'example.org',
 * });
 * server.start();
 * ```
 */
export function createTurnServer(config: TurnServerConfig = {}): TurnServerHandle {
  const ctx: TurnServerContext = {
    software: "turn-relay-ts",
    listeningIps: [],
    relayIps: config.relayIps || [],
    externalIps: config.externalIps || null,
    listeningPort: config.listeningPort || 3478,
    minPort: config.minPort || 49152,
    maxPort: config.maxPort || 65535,
    maxAllocateLifetime: config.maxAllocateLifetime || 3600,
    defaultAllocateLifetime: config.defaultAllocateLifetime || 600,
    authMech: config.authMech || "none",
    realm: config.realm || "universes.cc",
    staticCredentials: config.credentials || {},
    log: config.log || ((msg: string) => console.log(msg)),
    debugLevel: config.debugLevel
      ? DEBUG_LEVEL[config.debugLevel] ?? DEBUG_LEVEL.FATAL
      : DEBUG_LEVEL.FATAL,
    allocations: {},
    reservations: {},
    nonces: {},
    lastRelayIp: "",
    onMessage: null,
    _sockets: [],
    _started: false,
  };

  // Set listening IPs
  if (config.listeningIps) {
    ctx.listeningIps = config.listeningIps;
  } else {
    // Auto-detect
    ctx.listeningIps = ["0.0.0.0"];
    if (typeof require !== "undefined") {
      try {
        const os = require("node:os") as typeof import("node:os");
        const ifaces = os.networkInterfaces();
        for (const ifaceName of Object.keys(ifaces)) {
          const iface = ifaces[ifaceName];
          if (iface) {
            for (const net of iface) {
              if (net.family === "IPv6" && net.address.startsWith("fe80:")) continue;
              ctx.listeningIps.push(net.address);
            }
          }
        }
        ctx.listeningIps = [...new Set(ctx.listeningIps)];
      } catch { /* ignore */ }
    }
  }

  let dispatch: ((msg: StunMessage) => void) | null = null;

  const handle: TurnServerHandle = {
    start() {
      if (ctx._started) return;
      ctx._started = true;

      dispatch = createDispatchHandler(ctx);

      for (const ip of ctx.listeningIps) {
        const dst = createAddress(ip, ctx.listeningPort);
        const family = dst.family === TransportFamily.IPV6 ? "udp6" : "udp4";

        const socket = createUdpSocket(ctx, family);

        socket.on(
          "error",
          ((err: Error) => {
            ctx.log(`TURN socket error on ${ip}:${ctx.listeningPort}: ${err.message}`);
          }) as (...args: unknown[]) => void,
        );

        socket.on(
          "message",
          ((udpMessage: Uint8Array, rinfo: { address: string; port: number }) => {
            const src = createAddress(rinfo.address, rinfo.port);
            const transport: Transport = {
              protocol: TRANSPORT_PROTO.UDP,
              src,
              dst,
              socket,
            };
            try {
              const msg = decodeStunMessage(ctx, transport, udpMessage);
              if (msg && dispatch) {
                dispatch(msg);
              }
            } catch (err) {
              ctx.log(`TURN decode error: ${err}`);
            }
          }) as (...args: unknown[]) => void,
        );

        socket.on("listening", () => {
          ctx.log(`TURN server listening on ${ip}:${ctx.listeningPort}`);
        });

        socket.on("close", () => {
          ctx.log(`TURN server stopped on ${ip}:${ctx.listeningPort}`);
        });

        // Bind
        socket.bind({ address: ip, port: ctx.listeningPort, exclusive: true });

        ctx._sockets.push(socket);
      }
    },
    stop() {
      ctx._started = false;
      for (const sock of ctx._sockets) {
        try {
          sock.close();
        } catch { /* ignore */ }
      }
      ctx._sockets = [];
      // Clear allocation timers
      for (const key of Object.keys(ctx.allocations)) {
        const alloc = ctx.allocations[key];
        if (alloc.timer) clearTimeout(alloc.timer);
        delete ctx.allocations[key];
      }
    },
    addUser(username: string, password: string) {
      ctx.staticCredentials[username] = password;
    },
    removeUser(username: string) {
      delete ctx.staticCredentials[username];
    },
    context: ctx,
  };

  return handle;
}

// ---------------------------------------------------------------------------
// Exported pure function helpers (for testing / reuse)
// ---------------------------------------------------------------------------

/** Pure STUN message encoder (stateless). */
export function stunEncode(msg: StunMessage): Uint8Array {
  return encodeStunMessage(msg);
}

/** Pure STUN message decoder (stateless input, requires server context reference). */
export function stunDecode(
  ctx: TurnServerContext,
  transport: Transport,
  data: Uint8Array,
): StunMessage | null {
  return decodeStunMessage(ctx, transport, data);
}

/** Create a Transport descriptor. */
export function makeTransport(
  protocol: number,
  src: Address,
  dst: Address,
  socket: import("./types.ts").UdpSocket,
): Transport {
  return { protocol, src, dst, socket };
}

/** Create an Address value object. */
export function makeAddress(addr: string, port: number): Address {
  return createAddress(addr, port);
}

/** Compute the 5-tuple key for an allocation lookup. */
export function computeFiveTuple(t: Transport): string {
  return getTransport5Tuple(t);
}
