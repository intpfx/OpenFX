# OpenFX Local Admin Key Design

## Goal

Make `TEST` the single default management key for OpenFX loopback development without
injecting `OPENFX_ADMIN_KEY` into the local Web process.

Production and non-loopback deployments retain the existing fail-closed contract and
must continue to provide an explicit `OPENFX_ADMIN_KEY`.

## Current problem

The control plane already falls back to `TEST` when all of these conditions hold:

- `OPENFX_ADMIN_KEY` is absent;
- the request URL is loopback (`localhost`, `127.0.0.1`, or `::1`);
- the process is not marked as production through `DENO_DEPLOYMENT_ID` or
  `NODE_ENV=production`.

The currently running local HTTPS/pairing service does not use that contract. Its
temporary `/tmp/openfx-local-pairing-server.ts` launcher inherits and injects a
non-default `OPENFX_ADMIN_KEY`, and it marks the Nitro child with a local
`DENO_DEPLOYMENT_ID`. Consequently, `TEST` is not the effective local key.

The temporary launcher also points at a removed development worktree rather than the
current `main` checkout, so it is not a durable local-development entrypoint.

## Decision

Add a tracked local HTTPS/pairing launcher under `entry/web/tools/` and expose it
through the repository's Deno tasks.

Before spawning the Nitro child, the launcher will construct a child environment that:

- removes inherited `OPENFX_ADMIN_KEY`;
- removes inherited `DENO_DEPLOYMENT_ID`;
- removes an inherited production-only `NODE_ENV=production` value rather than passing
  it into this explicitly local command;
- preserves unrelated environment values required by Deno and the local process;
- supplies the local runtime-specific `DENO_DIR` and the independently managed
  `OPENFX_NODE_CREDENTIAL_KEY`.

The launcher will use the literal `TEST` only for its own bootstrap login request and in
the protected local pairing-information file. It will not inject `TEST` as
`OPENFX_ADMIN_KEY`; the server must reach the existing loopback fallback naturally.

## Runtime boundaries

The canonical launcher will derive the repository and Web roots from `import.meta.url`,
so it always targets the checkout that contains the tool. It will not contain an
absolute worktree path.

It will retain the existing local runtime behavior:

- Nitro listens on loopback port `8000`;
- the trusted `mkcert` TLS proxy listens on `https://127.0.0.1:34431`;
- `OPENFX_LOCAL_RUNTIME` names the private directory for certificates, Deno cache, and
  `pairing.json`;
- `OPENFX_NODE_CREDENTIAL_KEY` remains separate from the management key and may be
  explicitly provided; otherwise the launcher generates a development-only value;
- generated pairing information remains mode `0600`;
- `SIGINT` and `SIGTERM` shut down the Nitro child and TLS server cleanly.

The ordinary `web:dev` task keeps its current behavior. The new launcher is for the
loopback HTTPS/pairing workflow used by OpenFX Node.

## Interfaces

The launcher will expose a pure environment-construction function so the security
boundary can be tested without spawning servers. Its contract is:

```ts
createLocalWebEnvironment(
  inherited: Record<string, string>,
  runtimeDirectory: string,
  credentialKey: string,
): Record<string, string>
```

The returned record must omit `OPENFX_ADMIN_KEY` and `DENO_DEPLOYMENT_ID`. It must omit
`NODE_ENV` only when its normalized value is `production`; non-production values may be
preserved. It must set the requested `DENO_DIR` and `OPENFX_NODE_CREDENTIAL_KEY` without
mutating the input record.

The Web task will be named `local-pairing`, and the root task will be named
`web:local-pairing`. They make the loopback/TLS purpose explicit and do not replace the
ordinary hot-reload development task.

## Validation

Automated validation will cover:

1. An inherited `OPENFX_ADMIN_KEY`, deployment ID, and production marker are absent from
   the child environment.
2. Unrelated variables are preserved and the input object is not mutated.
3. The credential key and runtime-specific Deno directory are set exactly.
4. Existing control-plane tests continue to prove that loopback development falls back
   to `TEST` while production and non-loopback requests fail closed without an explicit
   key.
5. Formatting, lint, focused Web tests, the full repository check, and the deterministic
   Web build pass.

Runtime acceptance will:

1. Preserve the current local runtime directory and a rollback copy of its generated
   pairing information.
2. Build the Web application from the current `main` checkout.
3. Stop only the verified temporary launcher and its child.
4. Start the canonical launcher without `OPENFX_ADMIN_KEY` or production markers.
5. Verify the Nitro child environment does not contain either override.
6. Log in through `https://127.0.0.1:34431/api/admin/session` with `TEST` and require
   HTTP 200 plus the expected session cookie.
7. Verify health and pairing creation. Reuse the preserved credential-encryption key and
   local Deno runtime directory so existing encrypted control-plane state remains
   readable.
8. Verify the running OpenFX Node connection remains functional. If the default Deno KV
   storage identity changes when moving from the obsolete worktree path to `main`,
   migrate the stopped local KV database from the rollback copy before relaunching; do
   not silently discard pairings, audit records, or other local console state.

If the new launcher fails validation, the previous local launcher/runtime information
will remain available for recovery. No production environment or deployed secret will be
changed.

## Documentation

`entry/web/README.md` and the current OpenFX console architecture document will state
that:

- loopback development defaults to `TEST`;
- the canonical local launcher deliberately strips inherited management-key and
  deployment overrides;
- `OPENFX_ADMIN_KEY` remains mandatory for production and non-loopback access;
- `OPENFX_NODE_CREDENTIAL_KEY` is independent and must never reuse the management key.

## Non-goals

- Do not force `TEST` for production or non-loopback requests.
- Do not remove support for explicit production `OPENFX_ADMIN_KEY` values.
- Do not change session TTLs, cookies, rate limits, audit behavior, or Deno KV data.
- Do not reuse `TEST` as the node credential-encryption key.
- Do not change OpenFX Node tray, Perry UI, Relay, Agent, or monitoring behavior.
