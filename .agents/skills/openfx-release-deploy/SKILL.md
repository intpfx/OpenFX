---
name: openfx-release-deploy
description: Use when pushing OpenFX, changing CI, Deno Deploy workflows, deployment metadata, version injection, or verifying remote GitHub Actions.
---

# OpenFX Release Deploy

Use this skill for CI, deployment, push/release work, build metadata, and remote
workflow verification.

## Guardrails

- Do not push, create tags, or deploy unless the user asked for that outcome.
- Do not commit unrelated dirty work. Inspect the worktree and stage only intended
  files.
- Do not revert user changes.
- If CI fails, inspect the first real failing gate before changing behavior.
- Build metadata for the web page is injected by CI through:
  - `VITE_OPENFX_BUILD_TIME`
  - `VITE_OPENFX_BUILD_HASH`

## Key Files

- `.github/workflows/ci.yml`
- `deno.json`
- `deno.lock`
- `entry/web/deno.json`
- `entry/web/deploy/`
- `entry/web/README.md`
- `README.md`

## Release Flow

1. Inspect:
   - `git status --short --branch`
   - `git diff --stat`
   - relevant workflow files
2. Run local validation:
   - `deno task check`
   - `deno task web:build` when web output changed
3. If pushing, commit only intended files.
4. Push the target branch.
5. Verify GitHub Actions with `gh run list`, `gh run watch`, and
   `gh run view --log-failed` as needed.

## Final Response

Include:

- Local validation result.
- Commit/push/deploy status when applicable.
- Remote workflow status when applicable.
- Any known dirty files left untouched.
