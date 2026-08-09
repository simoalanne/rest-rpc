# AGENTS.md

## Overview

This repo is `rest-rpc`, a TypeScript library for defining one shared API contract and deriving RPC-style client and server code from it. The library is designed to be used in a monorepo with multiple packages that share the same API contract.

## Packages

- `@rest-rpc/core` - core library that has contract,client and openapi code.
- `@rest-rpc/server` - reusable server-side code for different server adapters.
- `@rest-rpc/express` - express server adapter
- `@rest-rpc/hono` - hono server adapter
- `@rest-rpc/react-query` - tanstack react-query client adapter
- `content/` contains documentation for the library and its packages. documentation is written in mdx and uses https://useblume.dev/.

### Commands
- `pnpm run build:packages` - Packages depend on each other through declaration files. After changing exported package APIs, run this to refresh dependents or when something appears stale or fails mysteriously.
- `pnpm run typecheck` - Run declaration builds and workspace typechecking.
- `pnpm run lint` - Run Biome to fix formatting and import ordering automatically.
- `pnpm run test` - Run tests
- `pnpm run check` - Run `lint`, `typecheck`, and `test` in sequence. Use this as the broad all-in-one pass.

### Notes
For documentation related tasks:
- README.md is shared across root and all packages. It's sole purpose is to link to the actual documentation in `content/docs/`. Updating documentation means updating the mdx files in `content/docs/`, not updating the README.md files.
