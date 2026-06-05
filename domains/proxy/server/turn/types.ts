/**
 * TURN/STUN Type Definitions
 * ===========================
 *
 * All interfaces, type aliases, and enums used across the TURN/STUN modules.
 *
 * @module turn/types
 */

import { DEBUG_LEVEL } from "./constants.ts";

// ---------------------------------------------------------------------------
// Transport address family
// ---------------------------------------------------------------------------

/** Transport address family. */
export enum TransportFamily {
  IPV4 = 0x01,
  IPV6 = 0x02,
}

// ---------------------------------------------------------------------------
// UDP Socket abstraction
// ---------------------------------------------------------------------------

/** Lightweight socket handle that both runtimes can satisfy. */
export interface UdpSocket {
  readonly remoteAddress?: string;
  readonly remotePort?: number;
  send(
    msg: Uint8Array,
    offset: number,
    length: number,
    port: number,
    address: string,
  ): Promise<void>;
  close(): void;
  on(
    event: "message" | "error" | "listening" | "close",
    handler: (...args: unknown[]) => void,
  ): void;
  address(): { address: string; family: string; port: number };
  /** Bind to a specific address/port. Node.js requires this; Deno creates bound. */
  bind(opts: { address: string; port: number; exclusive?: boolean }): void;
  /** The raw underlying object (Node.js dgram.Socket or Deno.DatagramConn). */
  readonly raw: unknown;
}

/** Platform-agnostic UDP listener factory. */
export interface UdpListener {
  type: "node" | "deno";
  createSocket(family: "udp4" | "udp6"): UdpSocket;
}

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

/** Parsed network address with family awareness. */
export interface Address {
  readonly family: TransportFamily;
  readonly address: string;
  readonly port: number;
}

/** Describes the transport (protocol, src, dst, socket). */
export interface Transport {
  protocol: number;
  src: Address;
  dst: Address;
  socket: UdpSocket;
}

/** A user identity for authentication. */
export interface User {
  username: string;
  password: string;
}

/** A STUN message attribute — raw decoded or ready-to-encode. */
export interface StunAttribute {
  type: number;
  name: string;
  length: number;
  padding: number;
  value: unknown; // typed per attribute
}

/** A parsed (or built) STUN message. */
export interface StunMessage {
  /** Server config reference (for auth, allocations). */
  serverCtx: TurnServerContext;
  transport: Transport;
  allocation: Allocation | null;
  class: number;
  method: number;
  useFingerprint: boolean;
  length: number;
  raw: Uint8Array;
  attributes: StunAttribute[];
  magicCookie: number;
  transactionID: string;
  user: User | null;
  state: number;
  debugLevel: number;
}

/** TURN allocation. */
export interface Allocation {
  transactionID: string;
  transport: Transport;
  fiveTuple: string;
  user: User | null;
  serverCtx: TurnServerContext;
  sockets: UdpSocket[];
  relayedTransportAddress: Address;
  lifetime: number;
  mappedAddress: Address;
  permissions: Record<string, number>; // address => expiry epoch ms
  channelBindings: Record<number, Address>; // channelNumber => peer address
  timeToExpiry: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** ChannelData message. */
export interface ChannelData {
  channelNumber: number;
  length: number;
  data: Uint8Array | null;
  padding: number;
}

/** Callback for debug / log output. */
export type DebugFn = (level: string, msg: string) => void;

// ---------------------------------------------------------------------------
// Server state / config
// ---------------------------------------------------------------------------

/** Internal mutable server state. */
export interface TurnServerContext {
  software: string;
  listeningIps: string[];
  relayIps: string[];
  externalIps: string | Record<string, string> | null;
  listeningPort: number;
  minPort: number;
  maxPort: number;
  maxAllocateLifetime: number;
  defaultAllocateLifetime: number;
  authMech: "none" | "short-term" | "long-term";
  realm: string;
  staticCredentials: Record<string, string>;
  log: (msg: string) => void;
  debugLevel: number;
  allocations: Record<string, Allocation>;
  reservations: Record<string, { socket: UdpSocket }>;
  nonces: Record<string, { ttl: number }>;
  lastRelayIp: string;
  /** Message dispatch. */
  onMessage: ((msg: StunMessage) => void) | null;
  /** Server shutdown. */
  _sockets: UdpSocket[];
  _started: boolean;
}

/** Public config passed to `createTurnServer`. */
export interface TurnServerConfig {
  listeningIps?: string[];
  relayIps?: string[];
  externalIps?: string | Record<string, string>;
  listeningPort?: number;
  minPort?: number;
  maxPort?: number;
  maxAllocateLifetime?: number;
  defaultAllocateLifetime?: number;
  authMech?: "none" | "short-term" | "long-term";
  realm?: string;
  credentials?: Record<string, string>;
  debugLevel?: keyof typeof DEBUG_LEVEL;
  log?: (msg: string) => void;
  /** Optional platform override. 'node' (default) or 'deno'. */
  platform?: "node" | "deno";
}

/** Control handle returned by `createTurnServer`. */
export interface TurnServerHandle {
  start(): void | Promise<void>;
  stop(): void;
  addUser(username: string, password: string): void;
  removeUser(username: string): void;
  readonly context: TurnServerContext;
}
