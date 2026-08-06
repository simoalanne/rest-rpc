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
| `request` | Optional Standard Schema-compatible schemas for `body`, `query`, `params`, and `headers`. `body` can also use `customBody({ schema, contentType })` to model the whole request body as one value. |
| `responses` | Required map of status codes to response schemas. At least one status must be 2xx. |
| `options` | Optional route behavior, currently `http` or `websocket`. HTTP routes are the default. |
| `messages` | WebSocket client and server message schemas. |
| `metadata` | Optional application metadata escape hatch. `router()` populates `{}` when omitted. |

`router()` validates structural rules that TypeScript cannot fully enforce at
runtime, such as duplicate request field names across `body`, `query`, `params`,
and `headers`. The flattened request key `context` is reserved for adapter
handler context, and request header declarations cannot use `content-type` or
duplicate another header name with different casing.

## Schema Libraries

Contract schemas use the Standard Schema interface. Runtime validation works
with synchronous Standard Schema-compatible schemas for request bodies, query,
params, headers, responses, stream chunks, and WebSocket messages.

Request key inference is built in for common object schemas from:

- Zod
- Valibot
- ArkType

Other Standard Schema libraries can still be used. For request schemas, provide
`request.requestKeys` manually or pass `resolveRequestKeys(schema)` to
`router()` or `routerAsync()` when the library cannot be
introspected automatically.

Use `type<T>()` for type-only schemas when runtime validation is unnecessary or
handled elsewhere. It implements Standard Schema as a no-op validator and
returns the input value as `T`.

```ts
import { router, type } from "@contract-first-api/core";

export const apiContract = router({
	health: {
		get: {
			method: "GET",
			path: "/health",
			responses: {
				200: type<{ status: "ok" }>(),
			},
		},
	},
});
```

Async validation is not supported in API contracts. Schemas must return a
Standard Schema result synchronously.

Shared route fields can be passed as `router()` options and are shallow merged
into every route. `pathPrefix` joins onto each route path, `metadata` merges
with route metadata, `commonResponses` merges with HTTP route responses, and
`commonHeaders` merges with request headers. Route fields win on key conflicts.

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
		commonHeaders: {
			"x-request-id": z.string().optional(),
		},
		commonResponses: {
			401: z.object({
				message: z.string(),
			}),
		},
	},
);
```

`route()` is a single-route convenience helper. Its options are limited to
processing controls like `validate` and `resolveRequestKeys`; put `path`,
`metadata`, and `responses` directly on the route declaration.

## Responses

Use `responses` for both successful and non-successful status codes. Values can
be Standard Schema-compatible schemas, `noBody()`, or `streamBody(schema)`.

```ts
import { noBody, streamBody } from "@contract-first-api/core";

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
				204: noBody(),
				404: z.object({
					code: z.literal("TODO_NOT_FOUND"),
				}),
			},
		},
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: streamBody(
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
  declared with `streamBody(schema)`. A stream response cannot be mixed with
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
`query.includeCompleted`, `headers["x-request-id"]`, and `body.title` become
regular fields on typed service and client inputs. Omitting `request.body` is
shorthand for no request body; use `body: noBody()` when you want to declare
that explicitly.

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

Incoming websocket messages are parsed before delivery. Messages that are not
valid JSON or do not match the declared incoming message schema close the
connection and are not delivered to `onMessage` callbacks.

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

The client serializes typed request input and parses declared server responses
as the contract's response output type. It stringifies declared request header
values and sends them after `getHeaders()`, so declared request headers win on
conflicts. Response validation is normally enforced on the server before data is
sent; set `validateResponses: true` when you want the client to additionally
validate declared HTTP responses, stream chunks, and WebSocket messages received
from the server.

Every HTTP route declaration exposes `fetchResponse()`, which returns either a
declared response envelope or an undeclared response. Envelope consists of `status`, `body`, and `headers`.

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

WebSocket routes expose `openConnection()`.

## Types Across Boundaries

Most APIs infer request, response, and message types directly from the contract
route at the call site. Use route helper types when a type needs to cross a
function, file, package, or module boundary.

```ts
import type {
	InferClientErrors,
	InferClientRequest,
	InferClientResponse,
	InferClientSuccessBody,
	InferServerRequest,
	InferServerResponse,
	InferServerSuccessBody,
} from "@contract-first-api/core";
import { apiContract } from "./contract";

export type CreateTodoClientRequest = InferClientRequest<
	typeof apiContract.todos.create
>;

export type CreateTodoServerRequest = InferServerRequest<
	typeof apiContract.todos.create
>;

export type CreateTodoClientResponse = InferClientResponse<
	typeof apiContract.todos.create
>;

export type CreateTodoServerResponse = InferServerResponse<
	typeof apiContract.todos.create
>;

export type CreateTodoErrors = InferClientErrors<
	typeof apiContract.todos.create
>;

export type TodoListClientBody = InferClientSuccessBody<
	typeof apiContract.todos.list
>;

export type TodoListServerBody = InferServerSuccessBody<
	typeof apiContract.todos.list
>;
```

`InferClientRequest` is the flattened request input shape passed to the client.
`InferServerRequest` is the flattened validated request output received by
server handlers. `InferServerResponse` is the declared `{ status, body }`
response input shape returned by handlers, while `InferClientResponse` is the
declared response output shape received by clients. Custom request bodies are
exposed as a single `body` field.

## OpenAPI Documents

Core can generate a plain OpenAPI document object from JSON HTTP route
declarations:

```ts
import {
	createOpenApiDocument,
	isTypeOnlySchema,
	looseJsonSchema,
} from "@contract-first-api/core";
import { apiContract } from "@example/shared";
import z from "zod";

export const openApiDocument = createOpenApiDocument(apiContract, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	servers: [{ url: "http://localhost:3000" }],
	schemaConverter: (schema, { io }) => {
		if (isTypeOnlySchema(schema)) return looseJsonSchema(schema);

		switch (schema["~standard"].vendor) {
			case "zod":
				return z.toJSONSchema(schema as z.ZodType, { io });
			default:
				return looseJsonSchema(schema);
		}
	},
});
```

Custom request bodies are included with their declared content type, and
declared request headers are included as header parameters. WebSocket routes
and routes with streaming responses are not included in the generated document.

Standard Schema defines validation, not JSON Schema conversion. OpenAPI
generation requires a `schemaConverter` option so each project can use the
converter that matches its schema library.

If your schema library cannot produce JSON Schema, do not use the OpenAPI
generator for faithful API documentation. For intentionally loose documents,
provide a converter that returns a broad schema such as `{}` for unsupported
schemas, or selectively converts known schemas and returns broad schemas for
the rest. That fallback is explicit project policy, not behavior inferred by
core.

Core exports `isTypeOnlySchema()` for detecting schemas created with
`type<T>()`, and `looseJsonSchema()` for returning a broad `{}` schema. Use
them when a contract intentionally carries TypeScript types without runtime
validation or detailed schema metadata.

Required parameters and schema-record body fields are derived from whether
their schemas accept `undefined`. Path parameters must be required; OpenAPI
generation throws if a path parameter schema is optional instead of documenting
that mismatch as required.

## How Core Connects To Other Packages

- `@contract-first-api/express` imports the same API contract to register
  routes, validate requests, and type service handlers.
- `@contract-first-api/react-query` creates hook and cache helpers from the
  API contract and core client options.
