/**
 * TURN Authentication Mechanisms
 * ===============================
 *
 * Supports three modes as defined in RFC 5389 / RFC 5766:
 *   - `none`:       No authentication (open relay).
 *   - `short-term`: Username + HMAC, no nonce/realm exchange.
 *   - `long-term`:  Username + HMAC with nonce/realm challenge-response.
 *
 * @module turn/auth
 */

import type { StunMessage, TurnServerContext, User } from "./types.ts";
import { STUN_CLASS } from "./constants.ts";
import { addAttr, createReply, getAttr } from "./stun-codec.ts";

// ---------------------------------------------------------------------------
// Nonce management
// ---------------------------------------------------------------------------

function generateNonce(nonces: Record<string, { ttl: number }>): string {
  const sessionTime = 3_600_000; // 1 hour
  function gen4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
  const nonce = gen4() + gen4() + gen4() + gen4() + gen4() + gen4() + gen4() + gen4();
  nonces[nonce] = { ttl: Date.now() + sessionTime };
  setTimeout(() => {
    delete nonces[nonce];
  }, sessionTime);
  return nonce;
}

function checkNonce(nonces: Record<string, { ttl: number }>, nonce: string): boolean {
  const entry = nonces[nonce];
  return !!entry && entry.ttl >= Date.now();
}

// ---------------------------------------------------------------------------
// Auth result type
// ---------------------------------------------------------------------------

export type AuthResult = { ok: true; reply: StunMessage } | {
  ok: false;
  error: Error;
  reply: StunMessage;
};

// ---------------------------------------------------------------------------
// Authentication handlers
// ---------------------------------------------------------------------------

function authNone(_ctx: TurnServerContext, msg: StunMessage): AuthResult {
  return { ok: true, reply: createReply(msg) };
}

function authShortTerm(
  ctx: TurnServerContext,
  msg: StunMessage,
): AuthResult {
  const reply = createReply(msg);
  const username = getAttr(msg, "username") as string | undefined;
  const integrity = getAttr(msg, "message-integrity");

  if (!username || integrity === false || integrity === undefined) {
    if (msg.class === STUN_CLASS.REQUEST) {
      reply.class = STUN_CLASS.ERROR;
      addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
      return { ok: false, error: new Error("Bad Request"), reply };
    } else {
      return { ok: false, error: new Error("silently discard"), reply };
    }
  }

  const password = ctx.staticCredentials[username];
  if (!password) {
    if (msg.class === STUN_CLASS.REQUEST) {
      reply.class = STUN_CLASS.ERROR;
      addAttr(reply, "error-code", { code: 401, reason: "Unauthorized" });
      return { ok: false, error: new Error("Unauthorized"), reply };
    } else {
      return { ok: false, error: new Error("silently discard"), reply };
    }
  }

  if (integrity !== false) {
    const user: User = { username, password };
    msg.user = user;
    reply.user = user;
    return { ok: true, reply };
  }

  if (msg.class === STUN_CLASS.REQUEST) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 401, reason: "Unauthorized" });
    return { ok: false, error: new Error("Unauthorized"), reply };
  }
  return { ok: false, error: new Error("silently discard"), reply };
}

function authLongTerm(
  ctx: TurnServerContext,
  msg: StunMessage,
): AuthResult {
  const reply = createReply(msg);
  const username = getAttr(msg, "username") as string | undefined;
  const integrity = getAttr(msg, "message-integrity");
  const realm = getAttr(msg, "realm") as string | undefined;
  const nonce = getAttr(msg, "nonce") as string | undefined;

  if (!integrity) {
    addAttr(reply, "realm", ctx.realm);
    addAttr(reply, "nonce", generateNonce(ctx.nonces));
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 401, reason: "Unauthorized" });
    return { ok: false, error: new Error("Unauthorized"), reply };
  }

  if (!username || !realm || !nonce) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 400, reason: "Bad Request" });
    return { ok: false, error: new Error("Bad Request"), reply };
  }

  if (!checkNonce(ctx.nonces, nonce)) {
    addAttr(reply, "realm", ctx.realm);
    addAttr(reply, "nonce", generateNonce(ctx.nonces));
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 438, reason: "Stale Nonce" });
    return { ok: false, error: new Error("Stale Nonce"), reply };
  }

  const password = ctx.staticCredentials[username];
  if (!password) {
    addAttr(reply, "realm", ctx.realm);
    addAttr(reply, "nonce", generateNonce(ctx.nonces));
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 401, reason: "Unauthorized" });
    return { ok: false, error: new Error("Unauthorized"), reply };
  }

  if (integrity === false) {
    addAttr(reply, "realm", ctx.realm);
    addAttr(reply, "nonce", generateNonce(ctx.nonces));
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 401, reason: "Unauthorized" });
    return { ok: false, error: new Error("Unauthorized"), reply };
  }

  // RFC 5766 §4: check allocation user matches
  if (
    msg.allocation && msg.allocation.user && msg.allocation.user.username !== username
  ) {
    reply.class = STUN_CLASS.ERROR;
    addAttr(reply, "error-code", { code: 441, reason: "Wrong Credentials" });
    return { ok: false, error: new Error("Wrong Credentials"), reply };
  }

  const user: User = { username, password };
  msg.user = user;
  reply.user = user;
  return { ok: true, reply };
}

/** Dispatch authentication based on configured mechanism. */
export function authenticate(
  ctx: TurnServerContext,
  msg: StunMessage,
): AuthResult {
  switch (ctx.authMech) {
    case "none":
      return authNone(ctx, msg);
    case "short-term":
      return authShortTerm(ctx, msg);
    case "long-term":
      return authLongTerm(ctx, msg);
    default: {
      const errReply = createReply(msg);
      return {
        ok: false,
        error: new Error(`Invalid auth mechanism: ${ctx.authMech}`),
        reply: errReply,
      };
    }
  }
}
