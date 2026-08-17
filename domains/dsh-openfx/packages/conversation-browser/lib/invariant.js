//#region src/invariant.ts
const PACKAGE_NAME = "dsh-conversation-browser";
/** Cordis companion plugin name. */
const name = "conversation-browser-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the plugin owns only entry-local navigation state and
* a slot registration. It emits no event and owns no cross-plugin relation.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
