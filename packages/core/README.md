# @contract-first-api/core

Define a shared API contract, derive path-based helper types, and create typed
runtime clients from the same API contract.

## Install

```bash
pnpm add @contract-first-api/core zod
```

## Define A Contract

Define a plain API contract with `defineContract()`.

```ts
import { defineContract } from "@contract-first-api/core";
import z from "zod";

export const apiContract = defineContract({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: z.object({
					items: z.array(
						z.object({
							id: z.string(),
							title: z.string(),
						}),
					),
				}),
			},
		},
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

The keys around each route declaration, like `todos.create`, become stable path
names used by helper types and integration packages. The grouping is for your
application; routing is driven by each route declaration's `method` and `path`.

## Contract Fields

Each HTTP route declaration can define:

| Field | Purpose |
| --- | --- |
| `method` | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. |
| `path` | HTTP path, with params using `:paramValue` syntax. |
| `request` | Optional Zod schemas for `body`, `query`, and `params`. Raw request routes can only define `query` and `params`. |
| `responses` | Required map of status codes to response schemas. At least one status must be 2xx. |
| `options` | Optional route behavior, currently `raw` or `websocket`. |
| `messages` | WebSocket client and server message schemas. |

`defineContract()` validates structural rules that TypeScript cannot fully
enforce at runtime, such as duplicate request field names across `body`,
`query`, and `params`.

## Responses

Use `responses` for both successful and non-successful status codes. Values can
be Zod schemas, `noBody`, or `stream(schema)`.

```ts
import { noBody, stream } from "@contract-first-api/core";

export const apiContract = defineContract({
	todos: {
		remove: {
			method: "DELETE",
			path: "/todos/:id",
			request: {
				params: z.object({
					id: z.string(),
				}),
			},
			responses: {
				204: noBody,
				404: z.object({
					code: z.literal("TODO_NOT_FOUND"),
				}),
			},
		},
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: stream(
					z.discriminatedUnion("type", [
						z.object({
							type: z.literal("created"),
							id: z.string(),
							title: z.string(),
						}),
						z.object({
							type: z.literal("completed"),
							id: z.string(),
						}),
					]),
				),
			},
		},
	},
});
```

Non-2xx entries are the typed error cases. There is no separate `errors` field.
Status codes are declared directly in `responses`.

## Route Modes

- **JSON routes** are the default. They can define request schemas and
  responses.
- **Raw request routes** use `options: { mode: "raw" }`. They can define
  `query`, `params`, and responses, but not a contract-managed request `body`
  schema.
- **Streaming routes** are HTTP routes whose successful response is
  declared with `stream(schema)`. A stream response cannot be mixed with
  multiple successful status codes.
- **WebSocket routes** use `options: { mode: "websocket" }`. They must use
  `method: "GET"` and define `messages.client` and `messages.server` instead of
  `responses`.

## Request Schemas

Requests are split into the same HTTP locations your backend receives:

```ts
const apiContract = defineContract({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			request: {
				params: z.object({
					id: z.string(),
				}),
				query: z.object({
					includeCompleted: z.coerce.boolean().optional(),
				}),
			},
			responses: {
				200: z.object({
					id: z.string(),
					title: z.string(),
				}),
			},
		},
	},
});
```

Integrations expose this as one flat request object. For example, `params.id`,
`query.includeCompleted`, and `body.title` become regular fields on typed
service and client inputs.

## Raw Request Routes

Raw request routes pass the request body through without contract-level Zod
validation while keeping typed params, query, and responses.

```ts
const apiContract = defineContract({
	images: {
		analyze: {
			method: "POST",
			path: "/images/:imageId/analyze",
			request: {
				params: z.object({
					imageId: z.string(),
				}),
				query: z.object({
					profile: z.enum(["fast", "accurate"]).optional(),
				}),
			},
			options: { mode: "raw" },
			responses: {
				200: z.object({
					width: z.number(),
					height: z.number(),
					format: z.string(),
				}),
			},
		},
	},
});
```

Client calls add the raw payload through an explicit `rawBody` field.

## WebSocket Routes

WebSocket routes define the JSON message shape each side is allowed to send.

```ts
const apiContract = defineContract({
	discuss: {
		connect: {
			method: "GET",
			path: "/discuss",
			options: { mode: "websocket" },
			messages: {
				client: z.object({
					type: z.literal("message"),
					text: z.string().min(1),
				}),
				server: z.object({
					type: z.literal("message"),
					text: z.string(),
				}),
			},
		},
	},
});
```

Incoming websocket messages are parsed and exposed as result objects so
application code can decide how to handle invalid messages.

## Typed Client

Use `initClient()` when you need a runtime client.

```ts
import { initClient } from "@contract-first-api/core";

const api = initClient(apiContract, {
	baseUrl: "http://localhost:3001/api",
	getHeaders: () => ({
		Authorization: `Bearer ${getAuthToken()}`,
	}),
	timeoutMs: 10_000,
});
```

Every HTTP route declaration exposes `fetchResponse()`, which returns either a
declared response envelope or an undeclared response:

```ts
const response = await api.todos.create.fetchResponse({
	title: "Write docs",
});

if (response.declared && response.status === 201) {
	console.log(response.body.id);
}
```

Routes with exactly one successful response also expose `fetch()`, which
returns the success body directly:

```ts
const todos = await api.todos.list.fetch();
console.log(todos.items);
```

WebSocket routes expose `connect()` and `tryConnect()`.

## Types Across Boundaries

Most APIs infer request, response, and message types directly from the contract
route at the call site. Use route helper types when a type needs to cross a
function, file, package, or module boundary.

```ts
import type {
	InferRouteClientReceivedMessage,
	InferRouteClientRequest,
	InferRouteClientResponse,
	InferRouteClientSendMessage,
	InferRouteErrors,
	InferRouteRequest,
	InferRouteResponse,
	InferRouteSuccessBody,
} from "@contract-first-api/core";
import { apiContract } from "./contract";

export type CreateTodoRequest = InferRouteRequest<
	typeof apiContract.todos.create
>;

export type CreateTodoResponse = InferRouteResponse<
	typeof apiContract.todos.create
>;

export type CreateTodoErrors = InferRouteErrors<
	typeof apiContract.todos.create
>;

export type TodoListBody = InferRouteSuccessBody<
	typeof apiContract.todos.list
>;

export type UploadImageRequest = InferRouteClientRequest<
	typeof apiContract.images.inspect
>;

export type FindTodosClientResponse = InferRouteClientResponse<
	typeof apiContract.todos.find
>;

export type DiscussClientMessage = InferRouteClientSendMessage<
	typeof apiContract.discuss.connect
>;

export type DiscussServerMessage = InferRouteClientReceivedMessage<
	typeof apiContract.discuss.connect
>;
```

`InferRouteRequest` is the flattened contract request shape. Client request
helpers use the same shape, except raw request routes include `rawBody`.
`InferRouteResponse` is the declared `{ status, body }` response union, and
`InferRouteErrors` is the declared non-2xx response union.

## OpenAPI Documents

Core can generate a plain OpenAPI document object from JSON HTTP route
declarations:

```ts
import { createOpenApiDocument } from "@contract-first-api/core";
import { apiContract } from "@example/shared";

export const openApiDocument = createOpenApiDocument(apiContract, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	servers: [{ url: "http://localhost:3000/api" }],
});
```

Raw request routes, WebSocket routes, and routes with streaming responses are
not included in the generated document.

## How Core Connects To Other Packages

- `@contract-first-api/express` imports the same API contract to register
  routes, validate requests, and type service handlers.
- `@contract-first-api/react-query` creates hook and cache helpers from the
  API contract and core client options.
