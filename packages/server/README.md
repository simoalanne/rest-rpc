# rest-rpc

REST APIs with RPC-like ergonomics.

Define HTTP routes with an expressive route builder and sensible defaults.
Call them through a typed client that feels like ordinary function calls.

Define routes alongside handlers and infer their response types. A separately
shared contract is also supported.

## Features

- Fluent route builder for HTTP
- Typed handlers for Node HTTP and Fetch runtimes, registrable on any framework's router.
- One-line servers for Bun, Node, and other Fetch runtimes, with Bun's native router on Bun.
- Typed Fetch client and TanStack Query utils.
- Typed errors sent as plain JSON, separate from successful responses
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
		// GET /todos/:id with path params and a declared 404 error.
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.error("TODO_NOT_FOUND", { status: 404 })
			.handler(({ params, errors }) => {
				const todo = findTodo(params.id);
				if (!todo) throw new errors.TODO_NOT_FOUND();
				return todo;
			}),
	},
};
```

Serve them with Bun, or with `serve` from `@rest-rpc/server/node` on Node:

```ts server.ts
import { createApp } from "@rest-rpc/server";
import { routes } from "./routes";

Bun.serve({ ...createApp(routes), port: 3000 });
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
import { initClient, isDeclaredError, safe } from "@rest-rpc/core";
import type { routes } from "./routes";
import contract from "./contract.json";

const api = contract as unknown as typeof routes;
const client = initClient(api, { baseUrl: "http://localhost:3000" });

const created = await client.todos.create({ body: { title: "Write docs" } });

// Calls reject with typed errors, or resolve to { error } or { data } with safe().
const { error, data } = await safe(
	client.todos.get({ params: { id: created.body.id } }),
);

if (!error) {
	console.log(data.body.title);
} else if (isDeclaredError(error) && error.code === "TODO_NOT_FOUND") {
	console.log("Todo not found");
} else {
	throw error;
}
```

## Documentation

Full documentation is available at [rest-rpc.vercel.app](https://rest-rpc.vercel.app).

## Packages

- [`@rest-rpc/core`](https://npmx.dev/package/@rest-rpc/core): Route declarations, Fetch client, and OpenAPI generation.
- [`@rest-rpc/server`](https://npmx.dev/package/@rest-rpc/server): Servers and route handlers for Fetch (`@rest-rpc/server`) and Node HTTP (`@rest-rpc/server/node`) runtimes.
- [`@rest-rpc/tanstack-query`](https://npmx.dev/package/@rest-rpc/tanstack-query): TanStack Query utils.
