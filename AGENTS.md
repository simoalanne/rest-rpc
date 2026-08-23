# AGENTS.md

## Overview

This repo is `rest-rpc`, a TypeScript library for defining one shared API contract and deriving RPC-style client and server code from it. The library is designed to be used in a monorepo with multiple packages that share the same API contract.

## Packages

- `@rest-rpc/core` - core library that has contract,client and openapi code.
- `@rest-rpc/server` - reusable server-side code for different server adapters.
- `@rest-rpc/express` - express server adapter
- `@rest-rpc/hono` - hono server adapter
- `@rest-rpc/fastify` - fastify server adapter
- `@rest-rpc/web` - Web `Request`/`Response` HTTP handler adapter for fetch-native runtimes and catch-all routes.
- `@rest-rpc/next` - next.js server/client adapter
- `@rest-rpc/tanstack-query` - TanStack Query options and key helpers
- `content/` contains documentation for the library and its packages. documentation is written in mdx and uses https://useblume.dev/.
- `integration-tests/` contains a shared integration test suite that runs real HTTP requests against server adapters. It is used to verify that the generated code works as expected across all supported server adapters.
- `benchmarks/` contains generated benchmark fixtures that exercise the library as a downstream consumer. It is used to measure TypeScript checker cost for contract declaration across the built-in type-only schema helper and the main supported validation libraries.

### Commands
- `pnpm run typecheck` - Run workspace typechecking.
- `pnpm run bench:typecheck -- "<message>"` - Build packages first, then run the generated downstream typecheck benchmark against package `dist` declarations.
- `pnpm run lint` - Run lint verification.
- `pnpm run test:unit` - Run package unit tests.
- `pnpm run test:integration` - Run the shared real HTTP integration suite.
- `pnpm run test` - Run both unit and integration tests. Prefer running the relevant test command for verification after code changes.
- `pnpm run check` - Run `lint`, `typecheck`, and `test` in sequence. Use this as the broad all-in-one pass.

### Formatting
Formatting is automated by commit hooks. Do not run formatting tools or make formatting-only edits unless the user explicitly asks.

### Tool Output
A command that exits successfully is successful. Do not report warnings from successful commands.

### Public API
- A package's root entry point is its public API surface. Subpath-only exports are not public API unless they are also re-exported from the package root.
- Do not use wildcard exports from package root entry points. Export each public symbol explicitly so the public surface is reviewable.
- Every exported declaration in a package root must have a TSDoc comment on the declaration itself, not on the re-export.
- Any function that is exported from a package root must be written as regular function, not an arrow function. This is required for API reference generation to be able to separate variables from functions. Non-exported functions should be arrow functions by default.

### Notes
For documentation related tasks:
- README.md is shared across root and all packages. It's sole purpose is to link to the actual documentation in `content/docs/`. Updating documentation means updating the mdx files in `content/docs/`, not updating the README.md files.
- Integration tests require network access. From sandboxed environments, they will fail with EPERM unless run with elevated permissions.
