---
name: rest-rpc
description: Use rest-rpc in TypeScript apps with server-first route builders or contract-first API design, server adapters, typed clients, TanStack Query, OpenAPI, streaming, and monorepo architecture. Use hosted docs for current API details.
---

# rest-rpc

Use this skill for `rest-rpc` work: setup, contracts, adapters, clients, TanStack Query, OpenAPI, streaming, migrations, debugging, and architecture.

## Core Model

`rest-rpc` provides REST APIs with RPC-like ergonomics. HTTP is the foundation:
explicit methods, paths, params, query, headers, bodies, statuses, content
types, and streams. Implicit defaults also produce ordinary HTTP routes.
There is no separate RPC protocol or transport to learn.

Clients are derived from server implementations with small generation step. When the client should be independent of the server and both should depend on a shared contract, contract-first development is also fully supported.

## Library Philosophy

`rest-rpc` is a type-safe bridge between a server framework and client applications.
It does not replace framework architecture:
keep using the framework's routing, modules, plugins, middleware, dependency
injection, auth, and deployment conventions. Use the matching adapter's `route`
or `implement`, then `registerRoutes` or `createRouteHandler` to connect typed
routes to the framework.

## Minimal Example

Define and register HTTP routes with Express:

```ts server.ts
import express from "express";
import { route, registerRoutes } from "@rest-rpc/express";
import { z } from "zod";

const todos = new Map<string, { id: string; title: string }>();

export const routes = {
	todos: {
		create: route
			.input(z.object({ title: z.string().min(1) }))
			.handler(({ input: { title } }) => {
				const todo = { id: crypto.randomUUID(), title };
				todos.set(todo.id, todo);
				return todo;
			}),
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.handler(({ params }) => {
				const todo = todos.get(params.id);
				return todo
					? { status: 200, body: todo }
					: { status: 404, body: { code: "TODO_NOT_FOUND" as const } };
			}),
	},
};

const app = express();
app.use(express.json());
registerRoutes(app, routes);
app.listen(3000);
```

Generate the client contract from the server route tree, then call the routes
as typed functions:

```ts
import { initClient } from "@rest-rpc/core";
import { generateContractFromType } from "@rest-rpc/core/generate";
import type { routes } from "./server";

const api = generateContractFromType<typeof routes>({
	filePath: "./server.ts",
	exportName: "routes",
});
const client = initClient(api, { baseUrl: "http://localhost:3000" });

const todo = await client.todos.create({ title: "Write docs" });
const response = await client.todos.get({ params: { id: todo.id } });
if (response.status === 200) {
	console.log(response.body.title);
}
```

## Packages

Use only packages required by the detected stack:

- `@rest-rpc/core`: route declarations, clients, OpenAPI, type helpers
- `@rest-rpc/tanstack-query`: TanStack Query integration
- `@rest-rpc/express`: Express adapter
- `@rest-rpc/fastify`: Fastify adapter
- `@rest-rpc/hono`: Hono adapter
- `@rest-rpc/nest`: NestJS adapter
- `@rest-rpc/fetch`: Fetch runtime adapter and catch-all routes
- `@rest-rpc/node`: Node `IncomingMessage`/`ServerResponse` servers and middleware

## When To Read Docs

The hosted docs are the source of truth for current APIs. Do not fetch docs for trivial architecture choices already covered here or on project's existing architecture. Do fetch docs before using unfamiliar exports, adding an integration, writing examples, or changing behavior that depends on exact package APIs.

Prefer targeted retrieval:

### Via MCP (Preferred)

The full documentation is available via MCP tools.

If tools are not installed they can be added using:

For Codex:

```bash
codex mcp add rest-rpc --url https://rest-rpc.dev/mcp
```

For Claude Code:

```bash
claude mcp add --transport http rest-rpc https://rest-rpc.dev/mcp
```

1. MCP `search_docs`
2. MCP `get_page`
3. MCP `list_pages` or `get_navigation` when discovery is needed

### Via fetching docs directly from the hosted site (only when MCP is unavailable)

Useful indexes:

- `https://rest-rpc.dev/agent-readability.json`
- `https://rest-rpc.dev/llms.txt`

### Via reading source code (when the documentation does not cover the needed details)

Read the source code from the installed package location. Exact paths differ based on package manager,
do not guess the install location and verify the path before reading. Each package ships `dist/` that contains
the transpiled JavaScript files and the TypeScript type declaration files. Each exported symbol is documented with
TSDoc comments. The source code is the ultimate source of truth for the current API, but it is not a substitute for the hosted docs.

## Project Workflow

For implementation tasks:

1. Inspect package manager, TypeScript config, framework/runtime, existing API shape, validation library, workspace layout, and installed `rest-rpc` versions.
2. Read targeted docs only when exact current API details are needed.
3. Install missing `rest-rpc` packages with the detected package manager.
4. Use the server adapter that matches the project framework. Prefer normal framework organization such as Express routers, Fastify plugins, Hono route modules, NestJS modules, or framework catch-all routes.
5. Declare routes with the adapter's `route` builder and export the completed route tree or its type. Input schemas validate requests, and handler returns infer output types.
6. Generate the client contract with `generateContractFromType` using a type-only server import. Generation needs filesystem access and the TypeScript 5 or 6 compiler API; run it at build time for browser clients.
7. Use `registerRoutes` when registering with a framework router. Use `createRouteHandler` when a runtime needs a custom matcher or catch-all handler.
8. Register routes in multiple modules when useful; route trees and handlers don't have to be monolithic.
9. Use typed client helpers for direct calls. Use `@rest-rpc/tanstack-query` for query/mutation options and keys when TanStack Query should be used instead.
10. If using contract-first declare contract in a package that both server and client depend on. Use `implement` to convert the contract into a server route tree and add handlers. Use the contract directly on the `initClient` call to create a typed client. No generation step is needed when the contract is shared.
11. Let types infer from the route declarations. If inference is not enough, prefer exported helper types over new ad-hoc types.
