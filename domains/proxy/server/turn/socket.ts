/**
 * UDP Socket Abstraction Layer
 * ==============================
 *
 * Bridges Node.js `dgram` and Deno `Deno.Datagram` under a common interface.
 *
 * - In Node.js, dgram.createSocket returns a dgram.Socket.
 * - In Deno,  Deno.listenDatagram({ type: 'udp4', ... }) returns a Deno.Datagram.
 *
 * @module turn/socket
 */

import type { UdpSocket } from "./types.ts";

/** Node.js adapter */
export function createNodeSocket(family: "udp4" | "udp6"): UdpSocket {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dgram = require("node:dgram") as typeof import("node:dgram");
  const raw = dgram.createSocket(family);
  return {
    get remoteAddress() {
      return undefined;
    },
    get remotePort() {
      return undefined;
    },
    send(
      msg: Uint8Array,
      offset: number,
      length: number,
      port: number,
      address: string,
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        const buf = Buffer.from(msg.buffer, msg.byteOffset, msg.byteLength);
        raw.send(buf, offset, length, port, address, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    close() {
      try {
        raw.close();
      } catch { /* ignore */ }
    },
    on(
      event: "message" | "error" | "listening" | "close",
      handler: (...args: unknown[]) => void,
    ) {
      raw.on(event, handler as (...args: unknown[]) => void);
    },
    address() {
      return raw.address();
    },
    bind(opts: { address: string; port: number; exclusive?: boolean }) {
      raw.bind(opts);
    },
    get raw() {
      return raw;
    },
  };
}

/** Deno adapter */
export function createDenoSocket(family: "udp4" | "udp6"): UdpSocket {
  const conn = Deno.listenDatagram({ transport: "udp", hostname: "0.0.0.0", port: 0 });
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const _on = (ev: string, h: (...args: unknown[]) => void) => {
    if (!listeners.has(ev)) listeners.set(ev, new Set());
    listeners.get(ev)!.add(h);
  };
  let closed = false;
  let addrInfo = { address: "0.0.0.0", family: "IPv4", port: 0 };
  (async () => {
    try {
      const addr = conn.addr as Deno.NetAddr;
      addrInfo = {
        address: addr.hostname,
        family: addr.hostname.includes(":") ? "IPv6" : "IPv4",
        port: addr.port,
      };
    } catch { /* ignore */ }
    const msgListeners = listeners.get("message");
    const errorListeners = listeners.get("error");
    for await (const [data, rinfo] of conn) {
      if (closed) break;
      const remote = rinfo as Deno.NetAddr;
      if (msgListeners) {
        for (const h of msgListeners) {
          try {
            h(data, { address: remote.hostname, port: remote.port });
          } catch { /* skip */ }
        }
      }
    }
  })().catch((err) => {
    const errListeners = listeners.get("error");
    if (errListeners) { for (const h of errListeners) h(err); }
  });
  return {
    get remoteAddress() {
      return undefined;
    },
    get remotePort() {
      return undefined;
    },
    async send(
      msg: Uint8Array,
      _offset: number,
      _length: number,
      port: number,
      address: string,
    ) {
      if (closed) throw new Error("Socket closed");
      const remote: Deno.NetAddr = { transport: "udp", hostname: address, port };
      await conn.send(msg, remote);
    },
    close() {
      closed = true;
      try {
        conn.close();
      } catch { /* ignore */ }
    },
    on(
      event: "message" | "error" | "listening" | "close",
      handler: (...args: unknown[]) => void,
    ) {
      _on(event, handler);
    },
    address() {
      return addrInfo;
    },
    bind(_opts: { address: string; port: number; exclusive?: boolean }) {
      // Deno listenDatagram already bound; nothing to do
    },
    get raw() {
      return conn;
    },
  };
}

/**
 * Create a UDP socket using the appropriate platform adapter.
 * Auto-detects Deno vs Node.js at runtime.
 */
export function createUdpSocket(
  ctx: { debugLevel: number },
  family: "udp4" | "udp6",
): UdpSocket {
  if (typeof Deno !== "undefined") {
    return createDenoSocket(family);
  }
  return createNodeSocket(family);
}
