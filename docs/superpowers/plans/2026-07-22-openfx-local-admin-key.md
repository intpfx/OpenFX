# OpenFX Local Admin Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TEST` the canonical loopback-development management key by preventing
the local HTTPS/pairing launcher from injecting `OPENFX_ADMIN_KEY` or production
markers, while preserving production fail-closed behavior and existing local console
state.

**Architecture:** Keep the existing control-plane fallback as the single authentication
source of truth. Add a pure child-environment constructor and a tracked HTTPS/pairing
launcher under `entry/web/tools/`; the launcher runs the built Nitro server from its own
checkout, clears inherited local-only overrides with `clearEnv`, gives Deno KV a stable
loopback `--location`, and keeps the node credential-encryption key independent. Runtime
cutover checkpoints and backs up the stopped KV database before moving it to the stable
location identity.

**Tech Stack:** Deno 2, TypeScript, Nitro, Deno KV, `mkcert`, repository Deno tasks,
Deno tests, curl/sqlite3 for local acceptance.

## Global Constraints

- Execute on the current `main` checkout; do not create another branch or worktree.
- Use test-driven development for code contracts: add the failing test, observe RED for
  the intended reason, implement the minimum behavior, then observe GREEN.
- Never inject `TEST` through `OPENFX_ADMIN_KEY`; the loopback control plane must select
  its existing fallback naturally.
- Never pass `DENO_DEPLOYMENT_ID` to the local Nitro child. Remove `NODE_ENV` only when
  its trimmed, case-normalized value is `production`.
- Preserve explicit production/non-loopback `OPENFX_ADMIN_KEY` support and fail-closed
  behavior.
- Keep `OPENFX_NODE_CREDENTIAL_KEY` independent from `TEST`; do not print it in
  commands, reports, logs, or review artifacts.
- Derive repository paths from `import.meta.url`; do not add user-specific or
  worktree-specific absolute paths.
- Preserve the local Deno KV state. Stop the owning process before checkpoint/copy, keep
  a rollback snapshot, and abort on ambiguous process or database identity.
- Do not change Perry, tray UI, Relay protocol, session TTL, cookie policy, rate
  limiting, audit semantics, or production deployment configuration.
- Update `.superpowers/sdd/progress.md` after each task and record exact commits, tests,
  review outcome, and runtime evidence without secrets.

---

## Task 1: Lock the local child-environment security boundary with TDD

**Files:**

- Create: `entry/web/tools/local-pairing-environment.ts`
- Create: `entry/web/tests/local-pairing-environment.test.ts`

- [ ] Add `entry/web/tests/local-pairing-environment.test.ts` with one test proving
      inherited management/deployment/production markers are removed, unrelated values
      are preserved, the credential key and runtime-local `DENO_DIR` are exact, and the
      input object is unchanged:

```ts
import { expect } from "@std/expect";

import { createLocalWebEnvironment } from "../tools/local-pairing-environment.ts";

Deno.test("local pairing child environment removes inherited auth and production overrides", () => {
  const inherited = {
    OPENFX_ADMIN_KEY: "must-not-leak",
    DENO_DEPLOYMENT_ID: "must-not-leak",
    NODE_ENV: " Production ",
    PATH: "/usr/bin",
  };
  const snapshot = structuredClone(inherited);

  const result = createLocalWebEnvironment(
    inherited,
    "/tmp/openfx-local",
    "0123456789abcdef0123456789abcdef",
  );

  expect(result).toEqual({
    PATH: "/usr/bin",
    DENO_DIR: "/tmp/openfx-local/deno-dir",
    OPENFX_NODE_CREDENTIAL_KEY: "0123456789abcdef0123456789abcdef",
  });
  expect(inherited).toEqual(snapshot);
});
```

- [ ] Add a second test proving a non-production `NODE_ENV` such as `development` is
      preserved while `OPENFX_ADMIN_KEY` and `DENO_DEPLOYMENT_ID` are still absent.
- [ ] Run the focused test and confirm RED because `local-pairing-environment.ts` does
      not exist:

```bash
deno test --allow-env entry/web/tests/local-pairing-environment.test.ts
```

Expected: non-zero exit with module-not-found for the intended helper.

- [ ] Create `entry/web/tools/local-pairing-environment.ts` with the exact public
      contract and no I/O:

```ts
import { join } from "jsr:@std/path@^1.1.4";

export const LOCAL_ADMIN_KEY = "TEST";
export const LOCAL_WEB_LOCATION = "https://127.0.0.1:34431";

export function createLocalWebEnvironment(
  inherited: Record<string, string>,
  runtimeDirectory: string,
  credentialKey: string,
): Record<string, string> {
  const environment = { ...inherited };
  delete environment.OPENFX_ADMIN_KEY;
  delete environment.DENO_DEPLOYMENT_ID;
  if (environment.NODE_ENV?.trim().toLowerCase() === "production") {
    delete environment.NODE_ENV;
  }
  environment.DENO_DIR = join(runtimeDirectory, "deno-dir");
  environment.OPENFX_NODE_CREDENTIAL_KEY = credentialKey;
  return environment;
}
```

- [ ] Run the focused test again and confirm GREEN.
- [ ] Run formatting/lint checks for the new files:

```bash
deno fmt --check entry/web/tools/local-pairing-environment.ts entry/web/tests/local-pairing-environment.test.ts
deno lint entry/web/tools/local-pairing-environment.ts entry/web/tests/local-pairing-environment.test.ts
```

Expected: all commands exit 0.

- [ ] Commit only this task:

```bash
git add entry/web/tools/local-pairing-environment.ts entry/web/tests/local-pairing-environment.test.ts
git commit -m "test(web): lock local pairing environment"
```

- [ ] Run task-spec review, then code-quality review, against the task commit. Fix and
      re-review until both are clean.

---

## Task 2: Add the canonical HTTPS/pairing launcher, task wiring, and documentation

**Files:**

- Create: `entry/web/tools/local-pairing-server.ts`
- Create: `entry/web/tests/local-pairing-server.test.ts`
- Modify: `entry/web/deno.json`
- Modify: `deno.json`
- Modify: `entry/web/README.md`
- Modify: `docs/openfx-console-architecture.md`

- [ ] Add `entry/web/tests/local-pairing-server.test.ts` before implementation. It must
      read both Deno configuration files and launcher source, then assert:

  - Web task `local-pairing` runs `tools/local-pairing-server.ts` with `--unstable-kv`.
  - Root task `web:local-pairing` delegates to the Web task.
  - The launcher imports `LOCAL_ADMIN_KEY`, `LOCAL_WEB_LOCATION`, and
    `createLocalWebEnvironment`.
  - The Nitro command uses `clearEnv: true`, the sanitized environment, and
    `--location`, `LOCAL_WEB_LOCATION`.
  - The launcher contains no `/Users/`, `.worktrees/`, `OPENFX_ADMIN_KEY:` property
    injection, or `DENO_DEPLOYMENT_ID:` property injection.

- [ ] Run the focused launcher contract test and confirm RED because the task and
      launcher do not exist:

```bash
deno test --allow-read entry/web/tests/local-pairing-server.test.ts
```

Expected: assertion failure for the missing task/launcher.

- [ ] Create `entry/web/tools/local-pairing-server.ts`. Follow the existing temporary
      launcher behavior, but implement these exact boundaries:

```ts
const repositoryRoot = new URL("../../../", import.meta.url);
const webRoot = new URL("../", import.meta.url);
const nitroPort = 8_000;
const tlsPort = 34_431;

const inherited = Deno.env.toObject();
const runtimeDirectory = inherited.OPENFX_LOCAL_RUNTIME?.trim();
if (!runtimeDirectory) throw new Error("OPENFX_LOCAL_RUNTIME is required");

const credentialKey = inherited.OPENFX_NODE_CREDENTIAL_KEY?.trim() || randomHex(16);
const childEnvironment = createLocalWebEnvironment(
  inherited,
  runtimeDirectory,
  credentialKey,
);

const nitro = new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--location",
    LOCAL_WEB_LOCATION,
    "--unstable-kv",
    "-A",
    ".output/server/index.ts",
  ],
  cwd: webRoot,
  clearEnv: true,
  env: childEnvironment,
  stdout: "inherit",
  stderr: "inherit",
}).spawn();
```

The full launcher must also:

- create/chmod `OPENFX_LOCAL_RUNTIME` as private mode `0700`;
- invoke `OPENFX_MKCERT_BIN` when provided and otherwise `mkcert` from `PATH`;
- create certificates for `localhost`, `127.0.0.1`, and `::1`;
- wait for `http://127.0.0.1:8000/api/health` before starting bootstrap requests;
- proxy HTTPS on `127.0.0.1:34431`, preserving method, headers, streaming request body,
  response status/body, and manual redirect behavior;
- use `LOCAL_ADMIN_KEY` only in its own `POST /api/admin/session` body and protected
  `pairing.json` payload;
- create a pairing through `POST /api/console/pairings` and require status 201 plus a
  string code;
- write `origin`, `pairingCode`, session cookie, `adminKey`, and root certificate path
  to `pairing.json`, then enforce mode `0600`;
- clean up the Nitro child, TLS server, and custom HTTP client on startup failure,
  `SIGINT`, `SIGTERM`, or child exit;
- guard execution with `if (import.meta.main) await main();` so tests/imports do not
  start services.

- [ ] Add task wiring:

```json
// entry/web/deno.json
"local-pairing": "deno run --unstable-kv -A tools/local-pairing-server.ts"

// deno.json
"web:local-pairing": "deno task --config entry/web/deno.json local-pairing"
```

- [ ] Update `entry/web/README.md` in Simplified Chinese. Add the canonical command and
      state that loopback HTTPS development defaults to `TEST`; the launcher
      deliberately removes inherited `OPENFX_ADMIN_KEY`, `DENO_DEPLOYMENT_ID`, and a
      production `NODE_ENV`; production/non-loopback still require an explicit key; the
      credential-encryption key is independent and must not reuse `TEST`.
- [ ] Update `docs/openfx-console-architecture.md` with the same operational contract,
      ports, `OPENFX_LOCAL_RUNTIME`, stable Deno location identity, and the production
      boundary.
- [ ] Run focused tests and existing authentication regression tests:

```bash
deno test --allow-env --allow-read entry/web/tests/local-pairing-environment.test.ts entry/web/tests/local-pairing-server.test.ts entry/web/tests/console-control-plane.test.ts
```

Expected: all tests pass, including loopback fallback and production fail-closed
coverage.

- [ ] Run formatting, lint, full repository check, and deterministic Web build:

```bash
deno fmt --check .
deno lint .
deno task check
deno task web:build
git diff --check
```

Expected: every command exits 0; Web build reports bounded Deno entry verification.

- [ ] Commit the launcher, task wiring, tests, and documentation together:

```bash
git add entry/web/tools/local-pairing-server.ts entry/web/tests/local-pairing-server.test.ts entry/web/deno.json deno.json entry/web/README.md docs/openfx-console-architecture.md
git commit -m "fix(web): default local admin key to TEST"
```

- [ ] Run task-spec review, then code-quality review, against the task commit. Fix and
      re-review until both are clean.

---

## Task 3: Preserve local state, replace the stale launcher, and prove the real runtime

**Files/runtime:**

- Read: `/tmp/openfx-local-pairing-server.ts`
- Preserve: current `OPENFX_LOCAL_RUNTIME` directory and `pairing.json`
- Operate: the exact listeners on TCP `8000` and `34431`
- Run: tracked `entry/web/tools/local-pairing-server.ts` through
  `deno task web:local-pairing`
- Record: `.superpowers/sdd/local-admin-key-runtime-report.md`

- [ ] Capture a preflight report without secrets: current commit, exact listener PIDs,
      commands, cwd, runtime directory, current KV database paths, OpenFX Node
      PID/executable, and health status. Abort if either port has multiple owners, the
      launcher/child relationship is ambiguous, or the child is not the known obsolete
      local pairing process.
- [ ] Capture the existing `OPENFX_NODE_CREDENTIAL_KEY` from the verified child
      environment into a shell variable without printing it. Require a non-empty 32-byte
      text or valid 32-byte Base64URL value before continuing.
- [ ] Create a unique rollback directory with `mktemp -d`; copy `pairing.json` and
      non-database runtime metadata before shutdown. Record the rollback path in the
      runtime report.
- [ ] Re-run the main-checkout Web build immediately before cutover:

```bash
deno task web:build
```

Expected: exit 0 and bounded Deno entry verification.

- [ ] Send `SIGTERM` only to the verified stale launcher. Wait for both the TLS listener
      and its Nitro child to exit. If graceful shutdown fails, re-verify PID identity
      before any stronger signal.
- [ ] With the KV owner stopped, locate the old `kv.sqlite3`. Require exactly one
      pre-existing candidate, run `PRAGMA wal_checkpoint(FULL);`, then copy the entire
      stopped runtime directory to the rollback directory. Never copy an actively
      written database.
- [ ] Establish the canonical stable KV location using the same runtime `DENO_DIR` and
      `--location=https://127.0.0.1:34431`. If its `kv.sqlite3` path differs from the
      old path, preserve the newly created empty database, copy the checkpointed old
      database to that exact canonical path, and verify `PRAGMA integrity_check;`
      returns `ok`. If the paths match, do not copy. Abort on multiple new candidates or
      any integrity failure.
- [ ] Start the tracked launcher detached from the current `main` checkout, explicitly
      unsetting inherited management/deployment/production markers at the outer command
      while passing the preserved runtime directory and credential key. Redirect logs to
      the private runtime directory; do not expose the credential key in the report.
- [ ] Wait for readiness, then verify the new listener ownership/cwd and inspect the
      Nitro child environment. Require:

  - command resolves to the tracked launcher under current `main`;
  - Nitro cwd resolves to `/Users/siaovon/Documents/OpenFX/entry/web`;
  - `OPENFX_ADMIN_KEY` absent;
  - `DENO_DEPLOYMENT_ID` absent;
  - `NODE_ENV=production` absent;
  - preserved `DENO_DIR` and credential-key presence (report presence only, never the
    value).

- [ ] Perform real HTTPS acceptance with the `mkcert` root CA and a private temporary
      cookie jar:

  1. `GET /api/health` returns 200.
  2. `POST /api/admin/session` with JSON `{ "key": "TEST" }` returns 200 and sets
     `openfx_admin_session`.
  3. `GET /api/admin/session` with that cookie returns 200.
  4. `POST /api/console/pairings` with that cookie returns 201 and a string pairing
     code.
  5. `GET /api/console/overview` with that cookie returns 200, proving the preserved
     active-node state and running OpenFX Node Relay still work.

- [ ] Verify generated `pairing.json` is mode `0600`, contains `adminKey: "TEST"`, and
      does not contain or imply the node credential-encryption key.
- [ ] Verify the OpenFX Node process still uses the expected executable, listens on port
      `24531`, and remains healthy after the Web cutover.
- [ ] Write `.superpowers/sdd/local-admin-key-runtime-report.md` with timestamps, PIDs,
      cwd/path evidence, HTTP status codes, KV old/canonical path decision, integrity
      result, rollback directory, and final process state. Redact cookies, pairing
      codes, admin session material, and the credential key.
- [ ] Have a fresh reviewer inspect the runtime report and live read-only evidence
      against this task. Resolve every finding and repeat affected checks until
      approved.

---

## Final verification and handoff

- [ ] Ask a fresh final reviewer to inspect the complete range from the plan commit
      through `HEAD`, all task reports, and the live runtime report for spec compliance,
      maintainability, security boundaries, and unintended scope.
- [ ] Re-run controller-owned verification after all review fixes:

```bash
deno test --allow-env --allow-read entry/web/tests/local-pairing-environment.test.ts entry/web/tests/local-pairing-server.test.ts entry/web/tests/console-control-plane.test.ts
deno task check
deno task web:build
git diff --check
git status --short --branch
```

Expected: all tests/checks/build pass; no uncommitted product changes remain; `main` is
the only local branch; the canonical local service is running from `main` and accepts
`TEST` without an explicit `OPENFX_ADMIN_KEY`.

- [ ] Report the implementation commits, validation totals, live process/port ownership,
      rollback path, and any remaining manual observation separately from confirmed
      automated evidence.
