# contract-first-api

Define an API contract once, then reuse it for runtime validation, typed Express
handlers, typed clients, optional React Query hooks, and OpenAPI documents.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Zod-4.3-3E67B1?logo=zod&logoColor=white)](https://zod.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-5.0-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)

`contract-first-api` is a small TypeScript toolkit for keeping JSON APIs,
raw-request routes, streams, and websockets aligned across your stack. You
define one API contract as a plain TypeScript object, then reuse it for request
validation, typed service handlers, typed clients, React Query, and OpenAPI
output.

## Core Idea

One API contract is the source of truth. Nested keys organize route
declarations naturally for your codebase; each terminal declaration provides the
HTTP or WebSocket semantics.

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContract } = initContracts();

export const apiContract = defineContract({
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: z.object({
					title: z.string().min(1),
				}),
			},
			responses: {
				201: z.object({
					id: z.string(),
					title: z.string(),
				}),
				409: z.object({
					code: z.literal("TITLE_ALREADY_EXISTS"),
				}),
			},
		},
	},
});
```

From that contract:

- `@contract-first-api/express` validates incoming requests and types services
- `@contract-first-api/core` builds a typed runtime client with `initClient`
  and generates OpenAPI documents from JSON route declarations
- `@contract-first-api/react-query` creates typed hooks and cache helpers
- shared packages can expose path-based request and response helper types

## Packages

| Package | Role |
| --- | --- |
| [`@contract-first-api/core`](./packages/core/README.md) | Define an API contract, derive shared types, create typed clients, and generate OpenAPI documents. |
| [`@contract-first-api/express`](./packages/express/README.md) | Mount a contract or contract fragment on an Express app with validation and typed services. |
| [`@contract-first-api/react-query`](./packages/react-query/README.md) | Create React Query hooks and cache helpers from an API contract. |

## Install

Install the core package wherever you define the API contract or create typed
clients:

```bash
pnpm add @contract-first-api/core zod
```

Then add the integration packages you need:

```bash
pnpm add @contract-first-api/express @contract-first-api/react-query
```

If your backend uses WebSocket route declarations with the Express adapter,
also install `ws` in that backend package:

```bash
pnpm add ws
pnpm add -D @types/ws
```

## Contract Responses

Every HTTP route declaration declares a `responses` map keyed by HTTP status
code. Each entry can be a Zod schema, `noBody`, or a `stream(schema)` response.

```ts
import { initContracts, noBody, stream } from "@contract-first-api/core";
import z from "zod";

const { defineContract } = initContracts();

export const apiContract = defineContract({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: z.object({
					items: z.array(todoSchema),
				}),
			},
		},
		remove: {
			method: "DELETE",
			path: "/todos/:id",
			request: {
				params: z.object({ id: z.string() }),
			},
			responses: {
				204: noBody,
				404: z.object({ code: z.literal("TODO_NOT_FOUND") }),
			},
		},
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: stream(todoEventSchema),
			},
		},
	},
});
```

Server handlers return typed response cases declared by the route:

```ts
const createTodoImplementation = implementContract(apiContract.todos.create).handler(
	({ title }) => {
		if (todoExists(title)) {
			return {
				status: 409,
				body: { code: "TITLE_ALREADY_EXISTS" },
			};
		}

		return {
			status: 201,
			body: createTodo(title),
		};
	},
);
```

## Client

Create a typed client from `@contract-first-api/core`:

```ts
import { initClient } from "@contract-first-api/core";
import { apiContract } from "@example/shared";

export const api = initClient(apiContract, {
	baseUrl: "http://localhost:3001/api",
	getHeaders: () => ({
		Authorization: `Bearer ${getAuthToken()}`,
	}),
	timeoutMs: 10_000,
});
```

`fetchResponse()` returns a declared or undeclared response envelope:

```ts
const response = await api.todos.create.fetchResponse({
	title: "Write the README",
});

if (response.declared && response.status === 201) {
	console.log(response.body.id);
}
```

When a route declaration has exactly one successful response, the client
also exposes `fetch()`, which returns that success body directly:

```ts
const todos = await api.todos.list.fetch();
console.log(todos.items);
```

WebSocket route declarations expose `connect()`:

```ts
const socket = api.discuss.connect.connect();

socket.onMessage((result) => {
	if (result.success) console.log(result.data);
});
```

## React Query

React apps can create hooks directly from the API contract and client options:

```ts
import { initReactQueryClient } from "@contract-first-api/react-query";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();
export const api = initReactQueryClient(apiContract, {
	queryClient,
	baseUrl: "http://localhost:3001/api",
});
```

```tsx
const todos = api.todos.list.useQuery();
const createTodo = api.todos.create.useMutation({
	onSuccess: async () => {
		await api.todos.list.invalidate();
	},
});
```

Hook data uses the typed response envelope, so response bodies live at
`data.body`.

## Recommended Setup

Typically, keep the API contract in a shared workspace package used by your
backend and frontend. Large APIs can define contract fragments in feature
modules and compose them into one exported `apiContract`.

- `shared` exports `apiContract` and helper types
- `backend` imports the contract and registers Express routes
- `frontend` imports the contract and creates a core client or React Query client
- app-specific helper types can live beside the contract

## Non-Goals

This library is intentionally small. It is not trying to be:

- a code generator or schema compiler
- a full backend framework
- a replacement for Express, fetch, Zod, or React Query
- an RPC framework that owns your route structure
- a project structure or architecture mandate

## Docs

- [Core package](./packages/core/README.md)
- [Express package](./packages/express/README.md)
- [React Query package](./packages/react-query/README.md)
- [Example project](./example/README.md)

## License

MIT
