# rest-rpc

REST-shaped APIs with function-shaped TypeScript.

Define your HTTP API once as a shared TypeScript contract, then derive typed
server handlers, fetch clients, openAPI documents, and more from it.

## Features

- Shared TypeScript contracts for HTTP APIs.
- Typed server handlers for Express, Hono, Fastify, Next.js, and Fetch runtimes.
- Typed fetch client.
- Typed TanStack Query helpers.
- Typed WebSockets, streaming, non-JSON requests/responses.
- OpenAPI documents generated from the TypeScript contract.
- Standard Schema support.

## Minimal Example

Define a contract

```ts
import { router } from "@rest-rpc/core";
import { z } from "zod";

export const api = router({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			response: z.object({
				id: z.string(),
				title: z.string(),
			}),
		},
	},
});
```

Implement the contract on the server

```ts
const routes = router(api, {
	todos: {
		get({ id }) {
			return getTodo(id);
		},
	},
});

registerRoutes(app, routes);
```

use the contract on the client with RPC-style function calls

```ts
import { initClient } from "@rest-rpc/core";
import { api } from "./contract";

const client = initClient(api, {
	baseUrl: "https://api.example.com",
});

const todo = await client.todos.get.fetch({
	id: "todo_1",
});
```

## Documentation

Full documentation is available at [rest-rpc.dev](https://rest-rpc.dev)

## Packages

- [`@rest-rpc/core`](https://npmx.dev/package/@rest-rpc/core): API contract, client and openAPI generation.
- [`@rest-rpc/express`](https://npmx.dev/package/@rest-rpc/express): Express server adapter.
- [`@rest-rpc/fastify`](https://npmx.dev/package/@rest-rpc/fastify): Fastify server adapter.
- [`@rest-rpc/hono`](https://npmx.dev/package/@rest-rpc/hono): Hono server adapter.
- [`@rest-rpc/next`](https://npmx.dev/package/@rest-rpc/next): Next.js adapter.
- [`@rest-rpc/web`](https://npmx.dev/package/@rest-rpc/web): Fetch runtime adapter
- [`@rest-rpc/tanstack-query`](https://npmx.dev/package/@rest-rpc/tanstack-query): TanStack Query adapter.
