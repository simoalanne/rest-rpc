# AGENTS.md

## Overview

This repo is `rest-rpc`, a TypeScript library for defining REST APIs with RPC-like ergonomics. It provides a type-safe way to declare HTTP routes, generate client contracts, and handle requests and responses. Both contract-first and server-first development approaches are supported but server-first is the recommended approach and what documentation shows.

## Packages

- `@rest-rpc/core` - core library that has contract,client and openapi code.
- `@rest-rpc/server` - reusable server-side code for different server adapters.
- `@rest-rpc/express` - express server adapter
- `@rest-rpc/hono` - hono server adapter
- `@rest-rpc/fastify` - fastify server adapter
- `@rest-rpc/nest` - NestJS server adapter
- `@rest-rpc/fetch` - Fetch runtime `Request`/`Response` HTTP handler adapter for fetch-native runtimes and catch-all routes.
- `@rest-rpc/node` - Node.js `IncomingMessage`/`ServerResponse` HTTP handler adapter for `node:http` servers.
- `@rest-rpc/tanstack-query` - TanStack Query options and key utils
- `content/` contains documentation for the library and its packages. documentation is written in mdx and uses https://useblume.dev/.

### Commands

- `pnpm run typecheck` - Run workspace typechecking.
- `pnpm run test` - Run runtime and type tests with Vitest.
- `pnpm run lint` - Run lint verification.
- `pnpm run check` - Run lint, typechecking, tests, and API documentation verification in sequence. Use this as the broad all-in-one pass.

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

- README.md is shared across root and all packages and describes the project user-facing features concisely. It should link to the actual documentation in `content/docs/` for broader context. Task asking to update documentation generally means updating the mdx files in `content/docs/`, not updating the README.md files unless the user explicitly asks to update the README.md.
- Library is currently pre v1.0.0 and is not yet stable. Breaking changes are expected until v1.0.0 is released.
