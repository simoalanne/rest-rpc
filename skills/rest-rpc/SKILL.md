---
name: rest-rpc
description: Use rest-rpc in TypeScript apps with server-first route builders or contract-first API design, Node and Fetch server runtimes, framework integration, typed clients, TanStack Query, OpenAPI, streaming, and monorepo architecture. Start from the cheatsheet in the installed package's README.
---

# rest-rpc

Use this skill for `rest-rpc` work: setup, contracts, server integration, clients, TanStack Query, OpenAPI, streaming, migrations, debugging, and architecture.

## Core Model

`rest-rpc` is a small type-safety layer for HTTP APIs, not a framework and not a
separate RPC protocol. Routes are plain HTTP (methods, paths, params, query,
headers, bodies, statuses, content types, streams) described with a route
builder. Server-first is the default: response types are inferred from handlers
and clients use a contract extracted at build time. Contract-first shares a
contract package between server and client instead.

An app that only needs typed endpoints can serve them directly with `createApp`.
An app with a framework keeps the framework's routing, middleware, auth,
dependency injection, and deployment conventions, and registers compiled routes
on it.

## Read the Cheatsheet First

Every `@rest-rpc/*` package ships the same `README.md`: a cheatsheet of the
whole API with code examples, matching the installed version. Read it before
writing rest-rpc code:

```bash
cat node_modules/@rest-rpc/core/README.md
```

Any installed `@rest-rpc/*` package works. In a monorepo, read it from the
workspace package that depends on rest-rpc, and verify the path instead of
guessing. If no package is installed yet, read the hosted copy at
`https://rest-rpc.vercel.app/docs/cheatsheet`.

Each cheatsheet section heading links to the full documentation for that
section.

## When the Cheatsheet Is Not Enough

Use the hosted docs only for details the cheatsheet does not cover, such as
exact edge-case behavior, every option of an API, or full integration guides.
The hosted docs describe the latest release, which can differ from the
installed version.

1. MCP tools, preferred: `search_docs`, then `get_page`, and `list_pages` or
   `get_navigation` for discovery. Add the server if it is missing:
   - Codex: `codex mcp add rest-rpc --url https://rest-rpc.vercel.app/mcp`
   - Claude Code: `claude mcp add --transport http rest-rpc https://rest-rpc.vercel.app/mcp`
2. Without MCP, fetch the page the cheatsheet links to, or use the indexes at
   `https://rest-rpc.vercel.app/llms.txt` and
   `https://rest-rpc.vercel.app/agent-readability.json`.
3. For details the docs do not cover, read the installed package's `dist/`:
   transpiled JavaScript and `.d.ts` files with TSDoc on every export.

## Project Workflow

1. Inspect package manager, TypeScript config, framework/runtime, existing API
   shape, validation library, workspace layout, and installed `rest-rpc`
   versions.
2. Install only the packages the stack needs: `@rest-rpc/server` for routes,
   `@rest-rpc/core` for clients, contracts and OpenAPI, and
   `@rest-rpc/tanstack-query` when the app uses TanStack Query.
3. Use the server runtime that matches the project's native request type:
   `@rest-rpc/server` for Fetch `Request` (Bun, Deno, Workers, Hono) and
   `@rest-rpc/server/node` for Node `IncomingMessage` (`node:http`, Express,
   Fastify). Follow the framework's normal organization, such as Express
   routers, Fastify plugins, or Hono route modules.
4. Export route trees from modules without side effects, so contract
   extraction can import them at build time. Route trees can be split across
   modules and composed.
5. Let types infer from route declarations. When inference is not enough,
   prefer the exported type helpers over ad-hoc types.
