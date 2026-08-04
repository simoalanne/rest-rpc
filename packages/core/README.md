# @contract-first-api/core

Define a shared API contract, derive path-based helper types, and create typed
runtime clients from the same API contract.

## Install

```bash
pnpm add @contract-first-api/core zod
```

Install any synchronous Standard Schema-compatible validation library alongside
core. Zod is used in these examples, but the contract API accepts Standard
Schema-compatible schemas.

## Define A Contract

Define a plain API contract with `router()`.

```ts
import { router } from "@contract-first-api/core";
import z from "zod";

export const apiContract = router({
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
| `request` | Optional Standard Schema-compatible schemas for `body`, `query`, and `params`. `body` can also use `customBody({ schema, contentType })` to model the whole request body as one value. |
| `responses` | Required map of status codes to response schemas. At least one status must be 2xx. |
| `options` | Optional route behavior, currently `http` or `websocket`. HTTP routes are the default. |
| `messages` | WebSocket client and server message schemas. |
| `metadata` | Optional application metadata escape hatch. `router()` populates `{}` when omitted. |

`router()` validates structural rules that TypeScript cannot fully
enforce at runtime, such as duplicate request field names across `body`,
`query`, and `params`.

## Schema Libraries

Contract schemas use the Standard Schema interface. Runtime validation works
with synchronous Standard Schema-compatible schemas for request bodies, query,
params, responses, stream chunks, and WebSocket messages.

Request key inference is built in for common object schemas from:

- Zod
- Valibot
- ArkType

Other Standard Schema libraries can still be used. For request schemas, provide
`request.requestKeys` manually or pass `resolveRequestKeys(schema)` to
`router()` or `routerAsync()` when the library cannot be
introspected automatically.

Async validation is not supported in API contracts. Schemas must return a
Standard Schema result synchronously.

Shared metadata can be passed as a `router()` option and is shallow
merged with route metadata. Route metadata wins on key conflicts.

```ts
export const apiContract = router(
	{
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				metadata: { auth: "optional" },
				responses: {
					200: z.array(
						z.object({
							id: z.string(),
							title: z.string(),
						}),
					),
				},
			},
		},
	},
	{
		metadata: { auth: "required" },
	},
);
```

## Responses

Use `responses` for both successful and non-successful status codes. Values can
be Standard Schema-compatible schemas, `noBody`, or `stream(schema)`.

```ts
import { noBody, stream } from "@contract-first-api/core";

export const apiContract = router({
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

- **HTTP routes** are the default. They can define request schemas and
  responses. By default, request body schemas are treated as JSON objects whose
  keys are flattened into client and service inputs.
- **Custom request bodies** use `customBody({ schema, contentType })` when the
  request body should be treated as one whole value instead of a flattened JSON
  object.
- **Streaming routes** are HTTP routes whose successful response is
  declared with `stream(schema)`. A stream response cannot be mixed with
  multiple successful status codes.
- **WebSocket routes** use `options: { mode: "websocket" }`. They must use
  `method: "GET"` and define `messages.client` and `messages.server` instead of
  `responses`.

## Request Schemas

Requests are split into the same HTTP locations your backend receives:

```ts
const apiContract = router({
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

## Custom Request Bodies

Custom request bodies keep the request body as one `body` value while keeping
typed params, query, and responses. The parsed body is validated with the
custom body schema.

```ts
const apiContract = router({
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
				body: customBody({
					schema: z.instanceof(Blob),
					contentType: "image/png",
				}),
			},
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

Client calls send the custom body through the `body` field. The client sets the
declared `Content-Type`. For `application/json` bodies it stringifies the body;
other custom body values are passed to `fetch` as-is.

## WebSocket Routes

WebSocket routes define the JSON message shape each side is allowed to send.

```ts
const apiContract = router({
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
	baseUrl: "http://localhost:3001",
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

`InferRouteRequest` is the flattened contract request shape. Custom request
bodies are exposed as a single `body` field.
`InferRouteResponse` is the declared `{ status, body }` response union, and
`InferRouteErrors` is the declared non-2xx response union.

## OpenAPI Documents

Core can generate a plain OpenAPI document object from JSON HTTP route
declarations:

```ts
import { createOpenApiDocument } from "@contract-first-api/core";
import { apiContract } from "@example/shared";
import z from "zod";

export const openApiDocument = createOpenApiDocument(apiContract, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	servers: [{ url: "http://localhost:3000" }],
	schemaConverter: (schema, { io }) =>
		z.toJSONSchema(schema as z.ZodType, { io }),
});
```

Custom request bodies are included with their declared content type. WebSocket
routes and routes with streaming responses are not included in the generated
document.

Standard Schema defines validation, not JSON Schema conversion. OpenAPI
generation requires a `schemaConverter` option so each project can use the
converter that matches its schema library.

## How Core Connects To Other Packages

- `@contract-first-api/express` imports the same API contract to register
  routes, validate requests, and type service handlers.
- `@contract-first-api/react-query` creates hook and cache helpers from the
  API contract and core client options.
