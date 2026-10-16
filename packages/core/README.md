# rest-rpc

REST APIs with RPC-like ergonomics.

Define HTTP routes with an expressive route builder and sensible defaults.
Call them through a typed client that feels like ordinary function calls.

Define routes alongside handlers and infer their response types. A separately
shared contract is also supported.

## Features

- Fluent route builder for HTTP
- Typed handlers for Express, Hono, Fastify, NestJS, Node HTTP, and Fetch runtimes.
- Typed Fetch client and TanStack Query utils.
- Typed Server-Sent Event streams and custom request/response bodies
- Standard Schema validation
- OpenAPI generation from route declarations
- Contract-first development

## Example

Define HTTP routes:

```ts routes.ts
export const routes = {
	todos: {
		// Defaults to POST /todos/create with a 200 JSON response.
		create: route
			.body(z.object({ title: z.string() }))
			.handler(({ body: { title } }) => createTodo(title)),
		// GET /todos/:id with path params and a 404 response.
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.handler(({ params }) => {
				const todo = findTodo(params.id);
				return (
					todo ?? { status: 404, body: { code: "TODO_NOT_FOUND" as const } }
				);
			}),
	},
};
```

Extract a minimal client contract from the route tree at build time, then call
the routes as typed functions:

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

## Documentation

Full documentation is available at [rest-rpc.dev](https://rest-rpc.dev).

## Packages

- [`@rest-rpc/core`](https://npmx.dev/package/@rest-rpc/core): Route declarations, Fetch client, and OpenAPI generation.
- [`@rest-rpc/server`](https://npmx.dev/package/@rest-rpc/server): Route handlers for Fetch (`@rest-rpc/server/fetch`) and Node HTTP (`@rest-rpc/server/node`) runtimes.
- [`@rest-rpc/tanstack-query`](https://npmx.dev/package/@rest-rpc/tanstack-query): TanStack Query utils.
