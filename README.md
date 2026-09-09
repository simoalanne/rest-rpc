# rest-rpc

REST-shaped APIs with function-shaped TypeScript.

Define your HTTP API once as a shared TypeScript contract, then derive typed
server handlers, fetch clients, openAPI documents, and more from it.

## Features

- Shared TypeScript contracts for HTTP APIs.
- Server-first and contract-first development approaches for maximum flexibility.
- Typed server handlers for Express, Hono, Fastify, NestJS, Node.js, and Fetch runtimes.
- Typed fetch client.
- Typed TanStack Query helpers.
- Typed WebSockets, streaming, non-JSON requests/responses.
- OpenAPI documents generated from the TypeScript contract.
- Standard Schema support.

## Minimal Example

### Contract-first approach

Define a contract

```ts
export const api = {
	todos: {
		getById: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, z.object({ id: z.string(), title: z.string() })),
	},
};
```

Implement the contract on the server

```ts
const routes = router(api, {
	todos: {
		getById({ id }) {
			return getTodo(id);
		},
	},
});

registerRoutes(app, routes);
```

Use the contract on the client with RPC-style function calls

```ts
const client = initClient(api, {
	baseUrl: "https://api.example.com",
});

const todo = await client.todos.getById({
	id: "todo_1",
});
```

### Server-first approach

Define and implement the server route

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

Create a client from the same contract

```ts
import { initClient } from "@rest-rpc/core";
import type { routes } from "./server";

const client = initClient<typeof routes>({
	baseUrl: "https://api.example.com",
});

const todo = await client.$post("/todos")({
	body: { title: "Ship v1" },
});
```

## Documentation

Full documentation is available at [rest-rpc.dev](https://rest-rpc.dev)

## Packages

- [`@rest-rpc/core`](https://npmx.dev/package/@rest-rpc/core): API contract, client and openAPI generation.
- [`@rest-rpc/express`](https://npmx.dev/package/@rest-rpc/express): Express server adapter.
- [`@rest-rpc/fastify`](https://npmx.dev/package/@rest-rpc/fastify): Fastify server adapter.
- [`@rest-rpc/hono`](https://npmx.dev/package/@rest-rpc/hono): Hono server adapter.
- [`@rest-rpc/nest`](https://npmx.dev/package/@rest-rpc/nest): NestJS server adapter.
- [`@rest-rpc/node`](https://npmx.dev/package/@rest-rpc/node): Node.js HTTP server adapter.
- [`@rest-rpc/fetch`](https://npmx.dev/package/@rest-rpc/fetch): Fetch runtime adapter.
- [`@rest-rpc/tanstack-query`](https://npmx.dev/package/@rest-rpc/tanstack-query): TanStack Query adapter.
