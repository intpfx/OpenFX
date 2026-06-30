---
name: openfx-repo-navigation
description: Use when answering OpenFX repository structure, module boundary, domain inventory, source ownership, or code navigation questions.
---

# OpenFX Repo Navigation

Use this skill for source-of-truth navigation, domain inventory, and architecture
questions.

## Starting Points

- `README.md`: public repo overview.
- `AGENTS.md`: global agent rules and skill routing.
- `deno.json`: root task/test/lint workspace boundary.
- `domains/`: independent products and domain modules.
- `domains/_shared/`: shared Deno-safe utilities.
- `entry/web/`: VitePlus + React + Nitro web app.
- `entry/desktop/`: Perry desktop app.

## Rules

- Source code is the truth. Historical references and memory are navigation aids.
- Use `rg` and `rg --files` for text/file discovery.
- For code-impact questions, prefer semantic/call-graph tools when available.
- Treat generated/public bundles as artifacts, not source-of-truth logic.
- Check a domain README or AGENTS file before editing domain-owned code.

## Useful Commands

```bash
rg --files
rg -n "<term>" domains entry .agents README.md AGENTS.md
deno task check
```

## Domain Notes

- `domains/BewlyScript/` owns the userscript product and has its own Bun workflow.
- `domains/map-poster/` owns poster render logic; web hosts the API/panel.
- `domains/e/` owns the agent framework and is part of the root Deno workspace.
- `domains/downip`, `domains/proxy`, `domains/how-much`, and `domains/_shared/tests` are
  covered by the root test task.
