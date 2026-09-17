# rest-rpc

REST APIs with RPC-like ergonomics.

Define HTTP routes with methods, paths, request segments, response statuses,
content types, and streaming—or start with sensible defaults. Call them through
a typed client that feels like ordinary function calls.

Define routes alongside handlers and infer their output types. A separately
shared contract is also supported.

## Features

- Fluent route builder for HTTP
- Typed handlers for Express, Hono, Fastify, NestJS, Node HTTP, and Fetch runtimes.
- Typed Fetch client and TanStack Query helpers.
- Typed NDJSON streams and custom request/response bodies
- Standard Schema validation
- OpenAPI generation from route declarations
- Contract-first development

## Example

Define HTTP routes with implicit or explicit details:

```ts server.ts
export const routes = {
	todos: {
		// Defaults to POST /todos/create with a plain JSON result.
		create: route
			.input(z.object({ title: z.string() }))
			.handler(({ input: { title } }) => createTodo(title)),
		// Explicit HTTP method, path params, and response statuses.
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.handler(({ params }) => {
				const todo = findTodo(params.id);
				return todo
					? { status: 200, body: todo }
					: { status: 404, body: { code: "TODO_NOT_FOUND" as const } };
			}),
	},
};
```

Derive the client contract from the server route tree's type, then call the
routes as typed functions:

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

## Documentation

Full documentation is available at [rest-rpc.dev](https://rest-rpc.dev).

## Packages

- [`@rest-rpc/core`](https://npmx.dev/package/@rest-rpc/core): Route declarations, Fetch client, and OpenAPI generation.
- [`@rest-rpc/express`](https://npmx.dev/package/@rest-rpc/express): Express server adapter.
- [`@rest-rpc/fastify`](https://npmx.dev/package/@rest-rpc/fastify): Fastify server adapter.
- [`@rest-rpc/hono`](https://npmx.dev/package/@rest-rpc/hono): Hono server adapter.
- [`@rest-rpc/nest`](https://npmx.dev/package/@rest-rpc/nest): NestJS server adapter.
- [`@rest-rpc/node`](https://npmx.dev/package/@rest-rpc/node): Node HTTP server adapter.
- [`@rest-rpc/fetch`](https://npmx.dev/package/@rest-rpc/fetch): Fetch runtime adapter.
- [`@rest-rpc/tanstack-query`](https://npmx.dev/package/@rest-rpc/tanstack-query): TanStack Query helpers.
