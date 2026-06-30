---
name: openfx-domain-migration
description: Use when importing, preserving, replacing, or deleting an old/local project into OpenFX domains or domains/_shared.
---

# OpenFX Domain Migration

Use this skill when moving an outside or legacy project into OpenFX, deciding whether a
project belongs in `domains/`, extracting reusable code into `domains/_shared/`, or
cleaning up old local/GitHub projects after migration.

## Guardrails

- Do not delete local or remote projects until the user explicitly confirms cleanup.
- Read the old project structure and git history before deciding what to keep.
- List all reusable patterns once before extraction; get user confirmation when the
  extraction scope is broad or destructive.
- Preserve memorial or historical projects without rewriting their stack.
- Keep public docs and source contracts aligned.
- Do not collapse independent products into shared utilities just because code looks
  reusable; product identity matters in this monorepo.

## Decision Matrix

| Source type                      | Destination                                         |
| -------------------------------- | --------------------------------------------------- |
| Historical/memorial site         | `domains/<name>/public/`, served mostly unchanged   |
| Independent product/tool         | `domains/<name>/`, preserving its natural structure |
| Pure algorithm or infrastructure | `domains/_shared/` with focused tests               |
| Unused throwaway code            | Archive or delete only after explicit confirmation  |

## Migration Flow

1. Identify source path, remote repository, license, and current branch state.
2. Read source tree and relevant git history.
3. Classify files as `domain`, `_shared`, `docs`, `public asset`, or `ignore`.
4. Propose the migration shape and validation plan.
5. Move/copy implementation, keeping edits scoped.
6. Update README and domain docs.
7. Add or update tests for shared or public behavior.
8. Run the narrow validation plus `deno task check`.
9. Only then perform optional cleanup of old local/remote projects if the user asked.

## Validation

For shared modules:

```bash
deno check domains/_shared/<module>.ts
deno test --allow-env domains/_shared/tests/
deno task check
```

For web-served domains, also build the web app.
