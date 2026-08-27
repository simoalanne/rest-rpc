---
name: rest-rpc
description: Use rest-rpc in TypeScript applications by reading the hosted docs as the current source of truth.
---

# rest-rpc

Use this skill when a task involves adding, using, explaining, or debugging
`rest-rpc` in an application or service.

`rest-rpc` is a TypeScript library for defining one shared API contract and
deriving strongly typed server and client surfaces from it.

At a high level:

- The contract is the source of truth for an HTTP API.
- Routes keep explicit REST details: method, path, query, headers, body,
  response, status codes, metadata, and content types.
- Application code gets RPC-shaped ergonomics: handlers and clients are called
  through a typed route tree.
- The same contract can power server handlers, fetch clients, TanStack Query
  helpers, OpenAPI documents, and WebSocket helpers.
- Runtime validation is schema-library friendly. Use Standard
  Schema-compatible libraries such as Zod, Valibot, or ArkType, or use the
  built-in type-only helper when runtime validation is not needed.
- Server adapters are available for Express, Fastify, Hono, Next.js, and
  Fetch runtime `Request`/`Response` runtimes.
- `@rest-rpc/core` contains the contract, client, and OpenAPI primitives.
- `@rest-rpc/server` contains shared server-side behavior.
- Adapter packages provide framework integration:
  `@rest-rpc/express`, `@rest-rpc/fastify`, `@rest-rpc/hono`,
  `@rest-rpc/next`, and `@rest-rpc/fetch`.
- `@rest-rpc/tanstack-query` derives query options, mutation options, and query
  keys from the same contract.

## Common Tasks

- Installing the right packages for the user's server framework.
- Creating or updating a shared contract module.
- Adding typed server handlers for an existing API.
- Creating a typed fetch client.
- Wiring TanStack Query helpers in a frontend.
- Generating OpenAPI from the contract.
- Modeling request params, query strings, headers, bodies, status-specific
  responses, streams, or WebSocket messages.
- Migrating hand-written HTTP client/server types to a shared contract.
- Explaining how to structure shared contract code in a monorepo or app.

## Source Of Truth

Before giving implementation guidance, writing examples, or changing code, read
the current hosted documentation from `https://rest-rpc.dev/`.

Prefer the AI-friendly and raw Markdown endpoints:

- Docs index for agents: `https://rest-rpc.dev/llms.txt`
- Full agent context, when available: `https://rest-rpc.dev/llms-full.txt`
- Quickstart raw Markdown:
  `https://rest-rpc.dev/docs/quickstart.md`
- Any docs page as raw Markdown by appending `.md` to the canonical URL, for
  example `https://rest-rpc.dev/docs/contract/declaration.md`

When a user asks for current behavior, package APIs, install commands, adapter
usage, OpenAPI generation, WebSockets, or edge-case request/response handling,
look up the relevant hosted docs page first. Then answer from those docs and the
user's project context.

## Project Workflow

When applying `rest-rpc` in a project:

- Inspect the app's package manager, TypeScript setup, server framework, client
  framework, and existing API shape.
- Install only the packages needed for that stack.
- Put the contract somewhere both server and client can import it, such as a
  shared package, workspace module, or app-local shared directory.
- Keep examples contract-first: define the route once, implement it with a
  server adapter, then call it from the generated client or TanStack Query
  helpers.
- Verify changes with the user's existing typecheck, tests, or build commands.
