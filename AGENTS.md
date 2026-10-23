# AGENTS.md

## Overview

This repo is `rest-rpc`, a TypeScript library for defining REST APIs with RPC-like ergonomics. It provides a type-safe way to declare HTTP routes, generate client contracts, and handle requests and responses. Both contract-first and server-first development approaches are supported but server-first is the recommended approach and what documentation shows.

## Packages

- `@rest-rpc/core` - core library that has contract,client and openapi code.
- `@rest-rpc/server` - route builder, handlers, validation and serialization. Runtime handlers are exported from the root (Fetch `Request`/`Response`) and the `@rest-rpc/server/node` subpath (Node `IncomingMessage`/`ServerResponse`).
- `@rest-rpc/tanstack-query` - TanStack Query options and key utils
- `content/` contains documentation for the library and its packages. documentation is written in mdx and uses https://useblume.dev/.

### Commands

- `pnpm run typecheck` - Run workspace typechecking.
- `pnpm run test` - Run runtime and type tests with Vitest.
- `pnpm run lint` - Run lint verification.
- `pnpm run readme:sync` - Regenerate the root `README.md` table of contents, then copy the README to every package README and to `content/docs/cheatsheet.mdx`.
- `pnpm run readme:verify` - Fail when the copies are out of sync with the root `README.md`.
- `pnpm run check` - Run lint, typechecking, tests, API documentation verification, and README sync verification in sequence. Use this as the broad all-in-one pass.

### Formatting

Formatting is automated by commit hooks. Do not run formatting tools or make formatting-only edits unless the user explicitly asks.

### Tool Output

A command that exits successfully is successful. Do not report warnings from successful commands.

### Public API

- A package's root entry point is its public API surface, plus the `@rest-rpc/server/node` subpath. Other subpath-only exports are not public API unless they are also re-exported from the package root. `scripts/check-public-api-docs.ts` lists the public subpaths.
- Do not use wildcard exports from public entry points. Export each public symbol explicitly so the public surface is reviewable.
- Every exported declaration in a public entry point must have a TSDoc comment on the declaration itself, not on the re-export.
- Any function that is exported from a public entry point must be written as regular function, not an arrow function. This is required for API reference generation to be able to separate variables from functions. Non-exported functions should be arrow functions by default.

### Notes

For documentation related tasks:

- The root `README.md` is a compact cheatsheet of the whole public API, aiming for roughly 500 lines. Readability wins over the line count. It is the source for the package READMEs and `content/docs/cheatsheet.mdx`, which `pnpm run readme:sync` generates: edit only the root `README.md`, then run the sync. The sync also regenerates the README's `## Contents` section from its headings and leaves it out of the MDX page, so do not edit it by hand. The skill in `skills/rest-rpc` points agents to the copy installed in `node_modules`.
- The cheatsheet follows the structure of `content/docs/`, which is the source of truth. Each section heading links to its docs page or section. Prefer focused code examples with short comments over prose. Show options, handler arguments, and result fields in the code itself, with a comment where the meaning isn't obvious, instead of listing them in prose under the example.
- When a change to `content/docs/` or to the public API changes what a cheatsheet section shows, update `README.md` and run `pnpm run readme:sync`. Otherwise a task asking to update documentation means updating the mdx files in `content/docs/`.
- Keep `README.md` valid MDX, since it is also published as a docs page: no HTML comments, and no `<` or `{` in prose outside code.
- Library is currently pre v1.0.0 and is not yet stable. Breaking changes are expected until v1.0.0 is released.
