# ADR 0001: Initial OpenFX stack

## Status

Accepted

## Decision

OpenFX starts as a TypeScript monorepo with:

- **Perry** for the desktop application
- **Fresh + Deno** for the web application
- **Vite** as the web build/dev toolchain used through Fresh's current documented path
- **Apache-2.0** as the repository license

## Context

The repository needs:

- fast iteration in TypeScript
- a distributable desktop binary without a heavyweight embedded browser runtime
- a web runtime compatible with Deno Deploy
- a code style that favors pure functions and easy automated testing

## Rationale

### Perry

Perry directly addresses the single-binary desktop distribution requirement while
keeping the implementation language in TypeScript.

### Fresh + Deno

Fresh is the most direct framework fit for a Deno-native application and aligns with
Deno Deploy deployment targets.

### Vite over Vite+

Vite+ is credible and evolving, but the initial public repository should prefer the more
stable and officially documented baseline used by Fresh today.

### Apache-2.0 over MIT

MIT would be workable, but Apache-2.0 gives contributors and adopters explicit patent
grants, which is usually the better default for a public application repository.
