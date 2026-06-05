/**
 * STUN / TURN Protocol Constants
 * ================================
 *
 * References:
 *   - RFC 5389  (STUN)
 *   - RFC 5766  (TURN)
 *
 * @module turn/constants
 */

/** STUN attribute types. */
export const STUN_ATTR = {
  MAPPED_ADDRESS: 0x0001,
  USERNAME: 0x0006,
  MESSAGE_INTEGRITY: 0x0008,
  ERROR_CODE: 0x0009,
  UNKNOWN_ATTRIBUTES: 0x000A,
  REALM: 0x0014,
  NONCE: 0x0015,
  XOR_MAPPED_ADDRESS: 0x0020,
  SOFTWARE: 0x8022,
  ALTERNATE_SERVER: 0x8023,
  FINGERPRINT: 0x8028,
  // TURN attributes (RFC 5766)
  CHANNEL_NUMBER: 0x000C,
  LIFETIME: 0x000D,
  XOR_PEER_ADDRESS: 0x0012,
  DATA: 0x0013,
  XOR_RELAYED_ADDRESS: 0x0016,
  EVEN_PORT: 0x0018,
  REQUESTED_TRANSPORT: 0x0019,
  DONT_FRAGMENT: 0x001A,
  RESERVATION_TOKEN: 0x0022,
} as const;

/** STUN method codes. */
export const STUN_METHOD = {
  BINDING: 0x001,
  ALLOCATE: 0x003,
  REFRESH: 0x004,
  SEND: 0x006,
  DATA: 0x007,
  CREATE_PERMISSION: 0x008,
  CHANNEL_BIND: 0x009,
} as const;

/** STUN message class codes. */
export const STUN_CLASS = {
  REQUEST: 0x00,
  INDICATION: 0x01,
  SUCCESS: 0x02,
  ERROR: 0x03,
} as const;

/** Transport protocols & family. */
export const TRANSPORT_PROTO = {
  UDP: 0x11,
} as const;

/** Magic cookie for STUN (RFC 5389 §6). */
export const MAGIC_COOKIE = 0x2112A442;

/** Debug severity levels. */
export const DEBUG_LEVEL = {
  ALL: 0,
  TRACE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  FATAL: 6,
  OFF: 7,
} as const;
