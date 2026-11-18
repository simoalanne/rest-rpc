# AGENTS.md

## Overview

This repo is `rest-rpc`, a TypeScript library for defining REST APIs with RPC-like ergonomics. It provides a type-safe way to define HTTP routes, generate client contracts, and handle requests and responses. Both contract-first and server-first development approaches are supported but server-first is the recommended approach and what documentation shows.

## Packages

- `@rest-rpc/core` - core library that has contract,client and openapi code.
- `@rest-rpc/server` - route builder, handlers, validation and serialization. Runtime handlers are exported from the root (Fetch `Request`/`Response`) and the `@rest-rpc/server/node` subpath (Node `IncomingMessage`/`ServerResponse`).
- `@rest-rpc/tanstack-query` - TanStack Query options and key utils
- `declarations/` - private package whose `src/index.ts` exports values built with the public API the way a consumer library would. Its typecheck emits declarations, so it fails when an exported type cannot be named from a package entry point. Add a case when the public API gains a new builder stage or result type.
- `content/` contains documentation for the library and its packages. documentation is written in mdx and uses https://useblume.dev/.

### Commands

- `pnpm run typecheck` - Run workspace typechecking.
- `pnpm run test` - Run runtime and type tests with Vitest.
- `pnpm run lint` - Run lint verification.
- `pnpm run readme:sync` - Regenerate the root `README.md` table of contents, then copy the README to every package README and to `content/docs/cheatsheet.mdx`.
- `pnpm run readme:verify` - Fail when the copies are out of sync with the root `README.md`.
- `pnpm run docs:validate` - Check the docs for broken links and anchors with `blume validate --strict`.
- `pnpm run check` - Run lint, typechecking, tests, API documentation verification, README sync verification and docs validation in sequence. Use this as the broad all-in-one pass.

### Formatting

Formatting is automated by commit hooks. Do not run formatting tools or make formatting-only edits unless the user explicitly asks.

### Tool Output

A command that exits successfully is successful. Do not report warnings from successful commands.

### Public API

- A package's root entry point is its public API surface, plus the `@rest-rpc/server/node` subpath. Other subpath-only exports are not public API unless they are also re-exported from the package root. `scripts/check-public-api-docs.ts` lists the public subpaths.
- Do not use wildcard exports from public entry points. Export each public symbol explicitly so the public surface is reviewable.
- Every exported declaration in a public entry point must have a TSDoc comment on the declaration itself, not on the re-export.
- Any function that is exported from a public entry point must be written as regular function, not an arrow function. This is required for API reference generation to be able to separate variables from functions. Non-exported functions should be arrow functions by default.

### Tests

- A test pins behavior. Pin only what a user of the public API relies on: documented behavior, plus realistic misuse whose outcome matters for correctness or security.
- Test through public entry points. Test an internal function directly only for logic that is hard to reach otherwise, and assert results rather than intermediate shapes.
- Do not pin error messages, internal state, output ordering or undefined edge cases. When misuse already fails somewhere, the exact failure is not a promise.
- When code does something the docs do not promise, do not add a test that makes it a requirement. Leave it unpinned, or document it first if users should rely on it.
- Prefer compile-time errors over runtime checks for incorrect API use, and pin them with type tests. Name the error only when the default TypeScript error would not explain why the code is wrong.
- Do not add runtime checks for values the types already reject. Add a runtime check only for what types cannot express, fail as early as possible, such as when routes are compiled rather than per request, and document it when it is not obvious.

### Notes

For documentation related tasks:

- The root `README.md` is a cheatsheet of common patterns. It is the source for the package READMEs and `content/docs/cheatsheet.mdx`, which `pnpm run readme:sync` generates: edit only the root `README.md`, then run the sync. The sync also regenerates the README's `## Contents` section from its headings and leaves it out of the MDX page, so do not edit it by hand. The skill in `skills/rest-rpc` points agents to the copy installed in `node_modules`.
- Each cheatsheet section is a task: a sentence or two, a `See [...]` link to where the docs cover it, and one self-contained example that works when copied, imports included. Keep the parts that aren't rest-rpc inline and minimal, such as an in-memory `Map` instead of a database. Sections don't have to follow the docs structure or cover every page or option.
- When a change to the public API breaks or changes what a cheatsheet example shows, update `README.md` and run `pnpm run readme:sync`. Otherwise a task asking to update documentation means updating the mdx files in `content/docs/`.
- Keep `README.md` valid MDX, since it is also published as a docs page: no HTML comments, and no `<` or `{` in prose outside code.
- Code in `content/docs/` is not type-checked, and outside the cheatsheet an example does not have to work when copied. Show the part the section is about and leave out setup such as imports and helper bodies. Use a `twoslash` block only where the inferred types are the point, and hide its setup with `// ---cut---`.
- Examples use a blog API: posts `{ id, title, body }`, users, and notifications for streams. Show only what the example is about: JSON unless the section is about content types, and status 200 unless it is about statuses.
- Keep comments in examples only when they say what the code does not show, such as the resulting request, an inferred type or an output.
- Document options as a type whose fields carry TSDoc comments, based on the TSDoc in the source without its links, rather than as a prose list after the type.
- Library is currently pre v1.0.0 and is not yet stable. Breaking changes are expected until v1.0.0 is released.
