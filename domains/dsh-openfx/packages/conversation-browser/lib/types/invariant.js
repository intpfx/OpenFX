/**
 * Package-owned invariant companion for `dsh-conversation-browser`.
 * @module dsh-conversation-browser/invariant
 */
const PACKAGE_NAME = 'dsh-conversation-browser';
/** Cordis companion plugin name. */
export const name = 'conversation-browser-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: the plugin owns only entry-local navigation state and
 * a slot registration. It emits no event and owns no cross-plugin relation.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
