# rest-rpc

## Core Position

`rest-rpc` is for developers who like RPC-style function calls and server handlers, but want to keep the actual API as idiomatic HTTP/REST.

It's closest reference is `ts-rest`, but it pushes the RPC-style API further by making the http details less visible outside the contract and by having basic support for streaming and WebSocket routes.

## Package Model

User-facing packages:

- `@rest-rpc/core`: contract DSL, type helpers, typed client, OpenAPI generation.
- `@rest-rpc/express`: Express adapter.
- `@rest-rpc/hono`: Hono adapter.
- `@rest-rpc/react-query`: TanStack Query adapter.

Adapter infrastructure:

- `@rest-rpc/server`: shared server-side route validation, handler typing,
  response normalization, matching, route tree helpers, and WebSocket handling. Not meant for direct use by applications or documented as user-facing API.

## Basic Usage end-to-end example.

A contract is a plain TypeScript object passed through `router()`.

```ts
export const contract = router({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			request: {
				params: {
					id: z.string(),
				},
			},
			responses: {
				200: todoSchema,
				404: z.object({
					code: z.literal("TODO_NOT_FOUND"),
				}),
			},
		},
	},
});
```

Contract is is implemented on the server:

```ts
export const routes = router(contract, {
	todos: {
		get({ id }) { // <-- handler input is flattened
			const todo = todos.get(id);

			if (!todo) {
				return {
					status: 404,
					body: {
						code: "TODO_NOT_FOUND",
					},
				};
			}

			return todo; // <-- single successfull response means handler can return body directly without an envelope
		},
	},
});
```

Client code is generated from the same contract:

```ts
const client = initClient(contract, {
	baseUrl: "https://api.example.com",
})

const todo = await client.todos.get({ id: "1" }); // <-- client input is flattened
```

Alternatively if user specifically cares about the response status, they can use `fetchResponse()`:

```ts
const response = await client.todos.get.fetchResponse({ id: "1" });

if (response.declared && response.status === 200) {
	console.log(response.body);
}
if (response.declared && response.status === 404) {
	throw new Error("Todo not found");
}
```


Route keys such as `todos.get` are stable code paths for generated handlers,
clients, React Query hooks, cache keys, and helper types. HTTP routing is still
driven by `method` and `path` and API under the hood remains idiomatic HTTP/REST.

## Contract DSL

HTTP route fields:

- `method`: `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`.
- `path`: HTTP path with Express-style `:param` segments.
- `request`: optional `body`, `query`, `params`, `headers`. Also includes `requestKeys` which stores the flattened request key list enabling the flattened input model to work. This is normally resolved automatically from the request schema.
- `responses`: required status-keyed response body map.
- `metadata`: application-defined escape hatch.
- `openApi`: operation hints for OpenAPI output.
- `options`: HTTP as default with WebSocket mode also available.

WebSocket route fields:

- `method: "GET"`.
- `path`.
- `request` for upgrade input.
- `options: { mode: "websocket" }`.
- `messages.client` and `messages.server`.

`router()` can apply shared route fields to every route in a tree:

- `pathPrefix`: joins a common prefix onto every route path.
- `metadata`: merged into route metadata, with route metadata winning.
- `commonResponses`: merged into route responses, with route responses winning.
- `commonHeaders`: merged into request headers, with route headers winning.
- `commonOpenApi`: merged into route OpenAPI metadata.

`route()` exists for a single route declaration. `routerAsync()` and
`routeAsync()` exist for async request key resolution.

Example:

```ts
export const api = router(
	{
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				responses: {
					200: z.object({
						items: z.array(todoSchema),
					}),
				},
				openApi: {
					summary: "List todos",
				},
			},
		},
	},
	{
		pathPrefix: "/api",
		metadata: {
			auth: "required",
		},
		commonHeaders: {
			"x-request-id": z.string().optional(),
		},
		commonResponses: {
			401: z.object({
				code: z.literal("UNAUTHORIZED"),
			}),
		},
		commonOpenApi: {
			tags: ["Todos"],
			security: [{ bearerAuth: [] }],
			responseDescriptions: {
				401: "Authentication is required.",
			},
		},
	},
);
```

The route above is normalized to `GET /api/todos`, includes the common request
header, includes the common `401` response, and keeps the route-specific
OpenAPI summary.

## Schemas

The contract accepts Standard Schema-compatible schemas.

The library currently includes built-in request key inference for common object
schemas from Zod, Valibot, and ArkType. Other Standard Schema libraries can be
used by providing `request.requestKeys` or `resolveRequestKeys` or by providing record shaped input where keys are known and only key values are Standard Schema-compatible schemas.

Library-owned `type<T>()` creates a type-only schema. It is useful when the contract should
carry TypeScript types but runtime validation is unnecessary or handled
elsewhere.

Example request schema:

```ts
request: {
	// resolves automatically.
	params: z.object({
		id: z.string(),
	}),
	// because type-only schema cannot resolve keys this can be worked around by using a record shape with type-only values.
	query: {
		includeCompleted: type<boolean | undefined>()
	},
	// As last resort, manually providing requestKeys is always possible but should almost always be unnecessary.
	body: type<{
		title: string;
	}>(),
	requestKeys: {
		title: "body",
	}
}
```

## Request Input Model

HTTP has separate request locations:

- body
- query
- params
- headers

`rest-rpc` keeps those locations explicit in the route contract, then flattens
them into one function input for handlers and clients.

Example contract:

```ts
request: {
	params: {
		id: z.string(),
	},
	query: {
		includeCompleted: z.coerce.boolean().optional(),
	},
	headers: {
		"x-request-id": z.string().optional(),
	},
	body: {
		title: z.string(),
	},
}
```

Handler/client shape:

```ts
{
	id: string;
	includeCompleted?: boolean;
	"x-request-id"?: string;
	title: string;
}
```

This is a central design decision. The call-site API is function-like because
the HTTP request locations are already encoded by the contract.

That same request model appears on both sides:

```ts
// Client
await api.todos.update.fetch({
	id: "todo_1",
	includeCompleted: true,
	"x-request-id": "req_1",
	title: "Write clearer docs",
});
```

```ts
// Server
update({ id, includeCompleted, "x-request-id": requestId, title, context }) {
	return updateTodo({
		id,
		title,
		includeCompleted,
		requestId,
		request: context.req,
	});
}
```

## Request Key Constraints

Flattening requires unambiguous names. Routes are rejected when flattened
request keys collide.

Invalid example:

```ts
request: {
	params: {
		id: z.string(),
	},
	body: {
		id: z.string(),
	},
}
```

Both fields would flatten to `id`, so the route is invalid.

Important constraints:

- Duplicate flattened keys across `body`, `query`, `params`, and `headers` are
  invalid.
- `context` is reserved for server handler context.
- Header keys are checked case-insensitively for duplicates.
- `content-type` is reserved as a request header.
- Path params in the URL must have matching `params` schema keys.
- `params` schema keys must correspond to actual path params.
- When using `customBody()`, the flattened `body` key is reserved for the custom
  body value.

The answer to "will flattened inputs lead to duplicate keys?" is: no, because
routes with duplicate flattened keys are invalid.

## Request Value Constraints

Query, params, and headers are serialized into HTTP fields. Their runtime values
must be finite scalar values where appropriate.

The practical rule:

- request body fields can be normal JSON-like values
- query values, params, and headers are scalar request fields
- non-object request bodies should use `customBody()`

The current implementation validates and serializes request input before fetch
and validates incoming request segments on the server before calling handlers.

Examples of values that fit the scalar request field model:

```ts
await api.todos.search.fetch({
	query: "docs",
	limit: 20,
	includeCompleted: false,
	"x-request-id": "req_1",
});
```

Examples that should remain in the JSON body or become a custom body:

```ts
await api.todos.create.fetch({
	title: "Write docs",
	labels: ["docs", "api"],
	settings: {
		notify: true,
	},
});
```

## Response Model

HTTP routes declare `responses` by status code.

```ts
responses: {
	200: todoSchema,
	404: z.object({
		code: z.literal("TODO_NOT_FOUND"),
	}),
}
```

There is no separate `errors` field. Non-2xx statuses are normal declared
responses.

Response schema values can be:

- Standard Schema-compatible schemas
- `noBody()`
- `customBody({ schema, contentType })`
- `stream(schema)`
- `stream(customBody({ schema, contentType }))`

At least one successful response is expected for HTTP route usage.

Concrete response variants:

```ts
responses: {
	200: z.object({
		id: z.string(),
		title: z.string(),
		completed: z.boolean(),
	}),
	404: z.object({
		code: z.literal("TODO_NOT_FOUND"),
	}),
}
```

```ts
responses: {
	204: noBody(),
}
```

```ts
responses: {
	200: customBody({
		contentType: "text/csv",
		schema: z.string(),
	}),
}
```

```ts
responses: {
	200: stream(customBody({
		contentType: "text/csv",
		schema: type<string>(),
	})),
}
```

## Server Handler Returns

Handlers can always return a response envelope:

```ts
return {
	status: 404,
	body: {
		code: "TODO_NOT_FOUND",
	},
};
```

When a route has exactly one successful status, a handler can return the success
body directly:

```ts
return {
	id: "todo_1",
	title: "Write docs",
	completed: false,
};
```

That shortcut is only valid because the success status is unambiguous.

Declared non-2xx responses still need an explicit envelope or
`ContractResponseError`.

Example with both success shortcut and explicit error response:

```ts
get({ id }) {
	const todo = todos.get(id);

	if (!todo) {
		return {
			status: 404,
			body: {
				code: "TODO_NOT_FOUND",
			},
		};
	}

	return todo;
}
```

Example with an explicit success envelope:

```ts
create({ title }) {
	return {
		status: 201,
		body: createTodo({ title }),
	};
}
```

Example with `ContractResponseError`:

```ts
get({ id }) {
	const todo = todos.get(id);
	if (!todo) {
		throw new ContractResponseError(api.todos.get, {
			status: 404,
			body: {
				code: "TODO_NOT_FOUND",
			},
		});
	}
	return todo;
}
```

The broader rule:

> Shortcuts exist only when the contract makes the missing HTTP detail
> unambiguous.

## Client API

`initClient(contract, options)` returns an API object with the same shape as the
contract.

Every HTTP route exposes `fetchResponse()`.

```ts
const response = await api.todos.get.fetchResponse({
	id: "todo_1",
});
```

`fetchResponse()` returns:

- `{ declared: true, status, body, headers }` for declared response statuses
- `{ declared: false, status, body, headers }` for undeclared statuses

Routes with one successful response also expose `fetch()`.

```ts
const todo = await api.todos.get.fetch({
	id: "todo_1",
});
```

`fetch()` returns the successful response body directly. It throws when the
response is undeclared or not a declared success response.

Use `fetchResponse()` when status handling is normal control flow. Use `fetch()`
when the route has one success result and non-success responses should use the
error path.

Client options:

- `baseUrl`
- `fetchOptions`
- `getHeaders`
- `timeoutMs`
- `unknownRequestKeys: "throw" | "strip"`
- `validateResponses`

`getHeaders()` must not return `content-type`. The content type belongs to the
route contract through JSON/default behavior or `customBody({ contentType })`.

Declared request headers win over headers returned by `getHeaders()`.

Example with global options and per-call fetch options:

```ts
const api = initClient(apiContract, {
	baseUrl: "https://api.example.com",
	getHeaders: () => ({
		authorization: `Bearer ${readToken()}`,
	}),
	timeoutMs: 10_000,
	fetchOptions: {
		credentials: "include",
	},
});
```

```ts
const todo = await api.todos.get.fetch(
	{
		id: "todo_1",
		"x-request-id": "req_1",
	},
	{
		cache: "no-store",
	},
);
```

Example status-aware flow:

```ts
const response = await api.todos.get.fetchResponse({
	id: "todo_1",
});

if (response.declared && response.status === 200) {
	return response.body;
}

if (response.declared && response.status === 404) {
	return undefined;
}

throw new Error(`Unexpected response: ${response.status}`);
```

## React Query Adapter

`initReactQueryClient(contract, { queryClient, ...clientOptions })` returns a
React Query API tree for HTTP routes. WebSocket routes are omitted.

Each HTTP route exposes wrappers for most common React Query hooks and cache helpers:

- `useQuery`
- `useSuspenseQuery`
- `useMutation`
- `getKey`
- `invalidate`
- `setData`
- `clear`

React Query follows React Query's success/error model:

- declared 2xx responses become `data`
- declared non-2xx responses become `error`
- undeclared responses become `error`
- runtime/client errors become `error`

This is intentionally different from `fetchResponse()`, which exposes all HTTP
statuses as values. React Query already has a success/error channel, so declared
error responses should not appear as successful query data.

Hook options accept normal React Query options plus `fetchOptions`. The adapter
passes TanStack Query cancellation signals through fetch options.

Query keys are based on the contract path plus request input. Request fields
with `undefined` values are omitted from generated keys.

For request-based queries, falsy request values disable `useQuery()` because valid request shape is always an object which is truthy.

Example setup:

```ts
import { initReactQueryClient } from "@rest-rpc/react-query";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

export const api = initReactQueryClient(apiContract, {
	queryClient,
	baseUrl: "/api",
	getHeaders: () => ({
		authorization: `Bearer ${readToken()}`,
	}),
});
```

Example query and mutation:

```tsx
const todo = api.todos.get.useQuery({
	id: "todo_1",
});

const createTodo = api.todos.create.useMutation({
	onSuccess: async () => {
		await api.todos.list.invalidate();
	},
	onError(error) {
		if ("status" in error && error.status === 409) {
			console.log(error.body.code);
		}
	},
});
```

Example cache helper:

```ts
api.todos.get.setData({ id: "todo_1" }, (current) =>
	current && current.status === 200
		? {
				...current,
				body: {
					...current.body,
					completed: true,
				},
			}
		: current,
);
```

## Express Adapter

The Express adapter is the normal Express server entry point.

Public shape:

- `route(contractRoute, handler)`
- `router(contractTree, handlers)`
- `routes(contractTree, implementations)`
- `registerRoutes(app, implementations, options?)`
- `expressWebSocket(...)`
- `matchRoute`
- `isCustomBody`
- `ContractResponseError`
- handler/context helper types

Handler context:

```ts
type HttpRouteHandlerContext = {
	req: Request;
};
```

The adapter registers HTTP routes on the Express app using each route's method
and path. It delegates route execution to the shared server package.

Express body parsing is intentionally not owned by the adapter. For normal JSON
routes, applications use `express.json()`. For custom bodies, applications can
choose body parsing based on `matchRoute()` and `isCustomBody()`.

WebSocket routes are registered with an explicit WebSocket registration object.

Example:

```ts
import { registerRoutes, router } from "@rest-rpc/express";
import express from "express";

const app = express();
app.use(express.json());

const routes = router(apiContract, {
	todos: {
		get({ id, context }) {
			context.req.log?.debug?.({ id }, "loading todo");
			const todo = todos.get(id);

			if (!todo) {
				return {
					status: 404,
					body: {
						code: "TODO_NOT_FOUND",
					},
				};
			}

			return todo;
		},
	},
});

registerRoutes(app, routes);
```

Example body parser selection for custom bodies:

```ts
const jsonParser = express.json();
const pngParser = express.raw({ type: "image/png" });

app.use((req, res, next) => {
	const matched = matchRoute(apiContract, req);
	const body = matched?.request?.body;

	if (isCustomBody(body) && body.contentType === "image/png") {
		return pngParser(req, res, next);
	}

	return jsonParser(req, res, next);
});
```

## Hono Adapter

The Hono adapter mirrors the Express adapter shape for Hono apps.

Public shape:

- `route(contractRoute, handler)`
- `router(contractTree, handlers)`
- `routes(contractTree, implementations)`
- `registerRoutes(app, implementations, options?)`
- `honoWebSocket(...)`
- handler/context helper types
- Hono-specific body parsing and WebSocket option types

Handler context:

```ts
type HttpRouteHandlerContext<TEnv extends Env = Env> = {
	c: Context<TEnv>;
};
```

The adapter exposes Hono-specific hooks such as `parseBody` and WebSocket
registration options. It should let Hono keep owning its request lifecycle.

Example:

```ts
import { registerRoutes, router } from "@rest-rpc/hono";
import { Hono } from "hono";

const app = new Hono();

const routes = router(apiContract, {
	todos: {
		get({ id, context }) {
			const userAgent = context.c.req.header("user-agent");
			void userAgent;
			const todo = todos.get(id);

			if (!todo) {
				return {
					status: 404,
					body: {
						code: "TODO_NOT_FOUND",
					},
				};
			}

			return todo;
		},
	},
});

registerRoutes(app, routes);
```

Example custom body parsing hook:

```ts
registerRoutes(app, routes, {
	parseBody: async ({ c, body }) => {
		if (isCustomBody(body)) {
			return c.req.arrayBuffer();
		}

		return c.req.json();
	},
});
```

## Server Package

The shared server package contains adapter infrastructure:

- route builders
- implementation tree validation
- route matching
- request validation
- handler result normalization
- response schema lookup
- HTTP route execution
- WebSocket route execution

This package is useful for implementing adapters or debugging adapter behavior.
It should not be presented as the beginner server API.

## Custom Bodies

Default JSON object request bodies are flattened into handler/client input.

Use `customBody({ schema, contentType })` when the body should be treated as one
whole value instead.

Request example:

```ts
request: {
	params: {
		id: z.string(),
	},
	body: customBody({
		schema: fileSchema,
		contentType: "image/png",
	}),
}
```

Handler/client shape:

```ts
{
	id: string;
	body: File;
}
```

Custom response bodies return/send the custom body with the declared content
type. On the client, a custom response body currently exposes the raw
`Response`, because the runtime cannot generally know how callers want to read
non-JSON data.

Custom bodies are not meant to be a full upload or media framework. They keep
simple non-JSON routes inside the same contract model.

Example contract:

```ts
export const api = router({
	images: {
		upload: {
			method: "PUT",
			path: "/images/:id",
			request: {
				params: {
					id: z.string(),
				},
				body: customBody({
					contentType: "image/png",
					schema: z.instanceof(Uint8Array),
				}),
			},
			responses: {
				204: noBody(),
			},
		},
		download: {
			method: "GET",
			path: "/images/:id",
			request: {
				params: {
					id: z.string(),
				},
			},
			responses: {
				200: customBody({
					contentType: "image/png",
					schema: z.instanceof(Uint8Array),
				}),
				404: z.object({
					code: z.literal("IMAGE_NOT_FOUND"),
				}),
			},
		},
	},
});
```

Example handler/client shape:

```ts
upload({ id, body }) {
	saveImage(id, body);
	return undefined;
}
```

```ts
await api.images.upload.fetch({
	id: "image_1",
	body: new Uint8Array(await file.arrayBuffer()),
});

const response = await api.images.download.fetch({
	id: "image_1",
});

const bytes = await response.arrayBuffer();
```

## Streaming Responses

Use `stream(schema)` for NDJSON-style streaming responses. Here the schema is wrapped to `AsyncIterable<schema>` for the handler and client.

Server handlers return an async iterable. Express/Hono write chunks to the
response. The default JSON stream content type is `application/x-ndjson`.

Use `stream(customBody({ schema, contentType }))` for custom stream content
types. The client receives the raw `Response` for custom stream bodies.

Streaming support is intentionally basic: enough to keep straightforward stream
routes in the contract, not a replacement for specialized streaming protocols.

Example contract:

```ts
const todoEventSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("created"),
		id: z.string(),
		title: z.string(),
	}),
	z.object({
		type: z.literal("completed"),
		id: z.string(),
	}),
]);

export const api = router({
	todos: {
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

Example server handler:

```ts
async function* readTodoEvents() {
	yield {
		type: "created" as const,
		id: "todo_1",
		title: "Write docs",
	};

	yield {
		type: "completed" as const,
		id: "todo_1",
	};
}

const routes = router(api, {
	todos: {
		events() {
			return readTodoEvents();
		},
	},
});
```

Example client:

```ts
const events = await api.todos.events.fetch();

for await (const event of events) {
	if (event.type === "created") {
		console.log(event.title);
	}
}
```

## WebSocket Routes

WebSocket routes use:

```ts
options: { mode: "websocket" }
```

They must use `method: "GET"` and define message schemas:

```ts
messages: {
	client: clientMessageSchema,
	server: serverMessageSchema,
}
```

Server handlers receive typed socket context. Client routes expose
`openConnection()`.

Incoming messages are parsed and validated before delivery. Invalid incoming
messages close the connection. Outgoing server messages are validated before
being sent.

WebSocket support is useful for simple typed message contracts. It should not be
presented as a complete realtime framework.

Example contract:

```ts
export const api = router({
	todos: {
		watch: {
			method: "GET",
			path: "/todos/:id/watch",
			options: {
				mode: "websocket",
			},
			request: {
				params: {
					id: z.string(),
				},
			},
			messages: {
				client: z.object({
					type: z.literal("ping"),
				}),
				server: z.discriminatedUnion("type", [
					z.object({
						type: z.literal("changed"),
						id: z.string(),
						completed: z.boolean(),
					}),
					z.object({
						type: z.literal("pong"),
					}),
				]),
			},
		},
	},
});
```

Example server handler shape:

```ts
watch({ id, context }) {
	context.socket.send({
		type: "changed",
		id,
		completed: false,
	});

	context.socket.onMessage((message) => {
		if (message.type === "ping") {
			context.socket.send({
				type: "pong",
			});
		}
	});
}
```

Example client:

```ts
const socket = api.todos.watch.openConnection({
	id: "todo_1",
});

socket.onMessage((message) => {
	if (message.type === "changed") {
		console.log(message.completed);
	}
});

socket.send({
	type: "ping",
});
```

## OpenAPI

`createOpenApiDocument(contract, options)` generates a plain OpenAPI document
object from HTTP route declarations.

Important behavior:

- HTTP routes are included.
- WebSocket routes are skipped.
- request params/query/header declarations become OpenAPI parameters.
- request bodies become OpenAPI request bodies.
- `customBody()` uses its declared content type.
- `stream()` responses document the wire response as string/binary-like content.
- status-keyed `responses` become OpenAPI responses.
- `openApi.responseDescriptions` must match declared response statuses.
- path parameters must be required.
- route `openApi` fields become operation fields.
- `commonOpenApi` applies shared operation metadata.
- `transformOperation` and `transformDocument` are escape hatches.

Standard Schema defines validation, not JSON Schema conversion. OpenAPI
generation requires a project-provided `schemaConverter`.

`isTypeOnlySchema()` and `looseJsonSchema()` support intentionally loose
OpenAPI output when a route uses `type<T>()` or unsupported schema metadata.

Example route metadata:

```ts
const api = router({
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: {
					title: z.string().min(1),
				},
			},
			responses: {
				201: todoSchema,
				409: z.object({
					code: z.literal("TODO_ALREADY_EXISTS"),
				}),
			},
			openApi: {
				summary: "Create a todo",
				operationId: "createTodo",
				responseDescriptions: {
					201: "Todo created.",
					409: "A todo with the same title already exists.",
				},
			},
			metadata: {
				auth: "required",
			},
		},
	},
});
```

Example document generation:

```ts
const document = createOpenApiDocument(api, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	servers: [{ url: "https://api.example.com" }],
	schemaConverter: (schema, { io }) => {
		if (isTypeOnlySchema(schema)) {
			return looseJsonSchema(schema);
		}

		if (schema["~standard"].vendor === "zod") {
			return z.toJSONSchema(schema as z.ZodType, { io });
		}

		return looseJsonSchema(schema);
	},
	transformOperation: ({ route, operation }) => {
		if (route.metadata.auth === "required") {
			return {
				...operation,
				security: [{ bearerAuth: [] }], // alternatively, use `commonOpenApi.security` to apply to all routes.
			};
		}

		return operation;
	},
});
```

## Feature Coverage Summary

Current covered areas:

- TypeScript-first contracts DSL
- Standard Schema-compatible validation
- runtime request validation
- runtime server response validation
- typed server handlers
- typed fetch client
- React Query hooks and cache helpers
- Express adapter
- Hono adapter
- shared adapter core
- OpenAPI document generation
- params/query/body/headers
- schema-record request declarations
- status-keyed responses
- typed non-2xx responses
- direct success-body shortcut for handlers
- `fetch()` success-body shortcut for clients
- `fetchResponse()` for status-aware client code
- custom request bodies
- custom response bodies
- streaming responses
- custom streaming bodies
- WebSocket routes
- route metadata
- first-class OpenAPI metadata
- shared route options through `router()`
- route matching helpers for adapter/body-parser integration
