/**
 * TURN/STUN NAT Traversal Server — Pure Functional TypeScript Module
 * ===================================================================
 *
 * Source:
 *   Originally from /Users/siaovon/Documents/Projects/core/serve.js (lines ~19907–22024),
 *   a Node.js TURN/STUN implementation based on the node-turn package.
 *
 * Reconstruct Record (June 2026):
 *   - Converted class-based JavaScript to pure functional TypeScript.
 *   - Extracted core protocol logic into standalone pure functions:
 *       * STUN message encode/decode
 *       * TURN Allocate / Refresh / ChannelBind / Send / CreatePermission
 *       * Authentication (long-term / short-term / none)
 *       * ChannelData message handling
 *   - Server lifecycle exposed as `createTurnServer(config)` returning a control handle.
 *   - All Buffer operations replaced with Uint8Array-compatible helpers (Deno-compatible).
 *   - Dual-platform: supports Node.js `dgram` and Deno `Deno.Datagram` via platform adapter.
 *   - Removed the implicit `Server.serve()` call at module end.
 *
 * References:
 *   - RFC 5389  (STUN)
 *   - RFC 5766  (TURN)
 *   - RFC 5769  (Test Vectors)
 *   - RFC 6062  (TURN Extensions for TCP)
 *   - RFC 6156  (TURN IPv6)
 *
 * @module turn-relay
 *
 * This file is now a re-export of the modular `turn/` subdirectory.
 * All public symbols and `createTurnServer` are available from this entry point
 * to maintain backward compatibility.
 */

export {
  // Types (value + type)
  TransportFamily,
  // Constants
  STUN_ATTR,
  STUN_METHOD,
  STUN_CLASS,
  TRANSPORT_PROTO,
  MAGIC_COOKIE,
  DEBUG_LEVEL,
  // Functions
  createTurnServer,
  stunEncode,
  stunDecode,
  makeTransport,
  makeAddress,
  computeFiveTuple,
} from './turn/mod.ts';

export type {
  Address,
  Transport,
  User,
  StunAttribute,
  StunMessage,
  Allocation,
  ChannelData,
  TurnServerContext,
  TurnServerConfig,
  TurnServerHandle,
  UdpSocket,
  UdpListener,
} from './turn/mod.ts';
