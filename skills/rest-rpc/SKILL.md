---
name: rest-rpc
description: Use rest-rpc in TypeScript apps with server-first route builders or contract-first API design, Node and Fetch server runtimes, framework integration, typed clients, TanStack Query, OpenAPI, streaming, and monorepo architecture. Use hosted docs for current API details.
---

# rest-rpc

Use this skill for `rest-rpc` work: setup, contracts, server integration, clients, TanStack Query, OpenAPI, streaming, migrations, debugging, and architecture.

## Core Model

`rest-rpc` provides REST APIs with RPC-like ergonomics. HTTP is the foundation:
methods, paths, params, query, headers, bodies, statuses, content types, and
streams, described with an expressive route builder and sensible defaults.
There is no separate RPC protocol or transport to learn.

Clients are derived from server implementations with a small build-time extraction step. When the client should be independent of the server and both should depend on a shared contract, contract-first development is also fully supported.

## Library Philosophy

`rest-rpc` is a small type-safety layer for HTTP APIs. It types and validates
what crosses the wire and what reaches handlers. It is not a framework: an app
that only needs typed endpoints can serve them directly on Node HTTP or a
fetch-native runtime, and an app that uses a framework keeps the framework's
routing, modules, plugins, middleware, dependency injection, auth, and
deployment conventions. Declare routes with `route` or `implement` from
`@rest-rpc/server/node` or `@rest-rpc/server/fetch`, compile them with
`compileRoutes`, then serve them with `createCatchAllHandler` or register each
compiled route on the framework's router.

## Minimal Example

Define HTTP routes in a module without side effects:

```ts routes.ts
import { route } from "@rest-rpc/server/node";
import { z } from "zod";

const todos = new Map<string, { id: string; title: string }>();

export const routes = {
	todos: {
		create: route
			.body(z.object({ title: z.string().min(1) }))
			.handler(({ body: { title } }) => {
				const todo = { id: crypto.randomUUID(), title };
				todos.set(todo.id, todo);
				return todo;
			}),
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.handler(({ params }) => {
				const todo = todos.get(params.id);
				return (
					todo ?? { status: 404, body: { code: "TODO_NOT_FOUND" as const } }
				);
			}),
	},
};
```

A handler returns a body for a 200 response, or an envelope with a numeric
`status` for anything else. Serve the routes:

```ts server.ts
import { createServer } from "node:http";
import { compileRoutes, createCatchAllHandler } from "@rest-rpc/server/node";
import { routes } from "./routes";

const handler = createCatchAllHandler(compileRoutes(routes));

createServer(async (req, res) => {
	const { matched } = await handler(req, res);
	if (!matched) res.writeHead(404).end();
}).listen(3000);
```

To use a framework's router instead, loop `compileRoutes(routes)` and register
each `route.method` and `route.path` with a handler that calls
`route.handle(...)` with the native request. rest-rpc reads request bodies
itself, so skip the framework's body parsing on those routes.

Extract the client contract from the route tree at build time, then call the
routes as typed functions:

```ts extract-contract.ts
import { writeFile } from "node:fs/promises";
import { extractContract } from "@rest-rpc/core";
import { routes } from "./routes";

await writeFile("contract.json", JSON.stringify(extractContract(routes)));
```

```ts
import { initClient } from "@rest-rpc/core";
import type { routes } from "./routes";
import contract from "./contract.json";

const api = contract as unknown as typeof routes;
const client = initClient(api, { baseUrl: "http://localhost:3000" });

const created = await client.todos.create({ body: { title: "Write docs" } });
const response = await client.todos.get({ params: { id: created.body.id } });
if (response.status === 200) {
	console.log(response.body.title);
}
```

## Packages

Use only packages required by the detected stack:

- `@rest-rpc/core`: route declarations, clients, OpenAPI and contract extraction
- `@rest-rpc/tanstack-query`: TanStack Query integration
- `@rest-rpc/server`: route handlers. Import from `@rest-rpc/server/fetch` for Fetch `Request`/`Response` runtimes and frameworks (Bun, Deno, Workers, Hono), or `@rest-rpc/server/node` for Node `IncomingMessage`/`ServerResponse` servers and frameworks (`node:http`, Express, Fastify)

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
4. Use the server runtime that matches the project's native request type. Prefer normal framework organization such as Express routers, Fastify plugins, Hono route modules, or framework catch-all routes.
5. Declare routes with the runtime's `route` builder and export the completed route tree from a module without side effects. Request segment schemas validate requests, and handler returns infer response types.
6. Extract the client contract with `extractContract(routes)` at build time, and give it the route tree type with a type-only import in client code.
7. Loop `compileRoutes(routes)` when registering with a framework router. Use `createCatchAllHandler(compileRoutes(routes))` when rest-rpc should do the routing. Pass framework values that handlers need through the `context` option of `handle`.
8. Register routes in multiple modules when useful; route trees and handlers don't have to be monolithic.
9. Use typed client utils for direct calls. Use `@rest-rpc/tanstack-query` for query/mutation options and keys when TanStack Query should be used instead.
10. If using contract-first declare contract in a package that both server and client depend on. Use `implement` to convert the contract into a server route tree and add handlers. Use the contract directly on the `initClient` call to create a typed client. No extraction step is needed when the contract is shared.
11. Let types infer from the route declarations. If inference is not enough, prefer exported helper types over new ad-hoc types.
