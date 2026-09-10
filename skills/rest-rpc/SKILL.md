---
name: rest-rpc
description: Use rest-rpc in TypeScript apps with contract-first or server-first API design, server adapters, typed clients, TanStack Query, OpenAPI, streaming, and monorepo architecture. Use hosted docs for current API details.
---

# rest-rpc

Use this skill for `rest-rpc` work: setup, contracts, adapters, clients, TanStack Query, OpenAPI, streaming/WebSockets, migrations, debugging, and architecture.

## Core Model

Choose the architecture that matches the application:

- In contract-first code, the shared API contract is the source of truth and each route is defined once in it.
- In server-first code, the Node.js or Fetch implementation tree is the source of truth and each route ends with its `.handler(...)`.
- Preserve explicit HTTP semantics: method, path, params, query, headers, body, responses, status codes, content types, and metadata.
- Derive server handlers, fetch clients, TanStack Query helpers, OpenAPI, and WebSocket helpers from a contract, or infer a client from a server-first implementation tree.
- Avoid duplicated client/server types when the contract can infer them.
- Declare contracts with the fluent `route` builder instead of untyped route
  object literals.
- Keep contracts modular, then compose contract objects where the full API
  surface is needed.
- Use Standard Schema-compatible validators such as Zod, Valibot, or ArkType when runtime validation is needed.
- Use the built-in type-only schema helper when runtime validation is unnecessary.

## Library Philosophy

`rest-rpc` is a type-safe bridge between an application's existing HTTP architecture and its API types. It does not replace framework architecture: keep using the framework's routing, modules, plugins, middleware, dependency injection, auth, and deployment conventions. Use `rest-rpc` explicitly where it preserves the contract-to-runtime type link. Prefer its helpers over partial or ad-hoc usage when they provide type safety: the core fluent `route` builder for contract-first declaration, server adapter `router`, `route`, or `implement` for implementations, `registerRoutes` or `createRouteHandler` for framework registration, and generated client route calls for typed HTTP requests.

Choose contract-first when the contract is independently shared, must generate OpenAPI or TanStack Query helpers, or needs to run across framework adapters. Choose server-first when a Node.js or Fetch server owns the API and colocating the handler with its method, path, request schemas, and inferred response union is more valuable than a separately named contract. Server-first is currently supported only by `@rest-rpc/node` and `@rest-rpc/fetch`:

```ts
import { route } from "@rest-rpc/node";

export const routes = {
	getTodo: route.get("/todos/:id").handler(({ id }) => ({
		status: 200 as const,
		body: { id, title: "Example" },
	})),
};
```

Create its client with `initClient<typeof routes>()`. Unlike a contract-first client such as `client.todos.get(...)`, a server-first client selects the wire route explicitly, such as `client.$get("/todos/:id", { params: { id } })`. Keep the implementation tree's type importable by the client package; no server runtime import is required when using `import type`.

## Minimal Example

### Contract-first approach

Define a contract and implement it on the server:

```ts
import { route } from "@rest-rpc/core";
import { z } from "zod";

export const api = {
	todos: {
		getById: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, z.object({ id: z.string(), title: z.string() })),
	},
};
```

```ts
// router and registerRoutes are exported from the server adapter package matching the framework, e.g. @rest-rpc/express
import { router, registerRoutes } from "@rest-rpc/express";
import { api } from "./contract";

const routes = router(api, {
	todos: {
		getById({ id }) {
			return getTodo(id);
		},
	},
});

registerRoutes(app, routes);
```

Use the contract on the client with RPC-style function calls:

```ts
import { initClient } from "@rest-rpc/core";
import { api } from "./contract";

const client = initClient(api, {
	baseUrl: "https://api.example.com",
});

const response = await client.todos.getById({
	id: "todo_1",
});

if (response.status === 200) {
	const todo = response.body;
}
```

### Server-first approach

Define and implement the server route:

```ts
import { createServer } from "node:http";
import { route, createRouteHandler } from "@rest-rpc/node";
import { z } from "zod";

export const routes = {
	todos: {
		create: route
			.post("/todos")
			.body(z.object({ title: z.string().min(1) }))
			.handler(({ title }) => ({
				status: 201,
				body: { id: crypto.randomUUID(), title, completed: false },
			})),
	},
};

const handle = createRouteHandler(routes);

const server = createServer(async (request, response) => {
	const { matched } = await handle(request, response);
	if (!matched) {
		response.writeHead(404).end("Not found");
	}
});

server.listen(3000);
```

Create a client from the same contract:

```ts
import { initClient } from "@rest-rpc/core";
import type { routes } from "./server";

const client = initClient<typeof routes>({
	baseUrl: "https://api.example.com",
});

// tree-shaped call is replaced with explicit method, path and non-flattened request.
const response = await client.$post("/todos", {
	body: { title: "Ship v1" },
});
const todo = response.body;
```

## Packages

Use only packages required by the detected stack:

- `@rest-rpc/core`: contracts, clients, OpenAPI primitives
- `@rest-rpc/tanstack-query`: TanStack Query integration
- `@rest-rpc/express`: Express adapter
- `@rest-rpc/fastify`: Fastify adapter
- `@rest-rpc/hono`: Hono adapter
- `@rest-rpc/nest`: NestJS adapter
- `@rest-rpc/fetch`: Server adapter for fetch-based runtimes (Next.js, Deno, Bun, Cloudflare Workers, etc.)
- `@rest-rpc/node`: Server adapter for Node.js `IncomingMessage`/`ServerResponse`, including direct Node HTTP servers and middleware integration
- `@rest-rpc/server`: Low-level server helpers. Ignore by default unless implementing a custom server adapter.

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
4. Put shared contracts somewhere both server and client can import: a workspace package, shared app module, or app-local shared directory.
5. Use the server adapter that matches the project framework. Prefer normal framework organization such as Express routers, Fastify plugins, Hono route modules, NestJS modules, or framework catch-all routes.
6. Declare the contract with the core fluent `route` builder.
7. Use the server adapter's `router` and `route` helpers to implement that contract. server adapter's `route` is not the same as the core `route`.
8. Use `registerRoutes` when registering with a framework router. Use `createRouteHandler` when a runtime needs a custom matcher or catch-all handler.
9. Register routes in multiple modules when useful; neither contracts nor handlers need to be monolithic.
10. Use typed client helpers for direct calls. Use `@rest-rpc/tanstack-query` for query/mutation options and keys when the app already uses TanStack Query.
11. Let types infer from the contract. If inference is not enough, prefer exported helper types over new ad-hoc types.
