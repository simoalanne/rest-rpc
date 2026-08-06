# @contract-first-api/core

Use this reference for defining the API contract, deriving shared types, and
creating typed clients.

## Purpose

`@contract-first-api/core` defines a shared API contract, helper types, response
helpers, and the runtime client.

Contracts accept Standard Schema-compatible schemas. Zod is used in examples,
but it is not required.

## Main API

Create the API contract with `router()`.

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
	},
});
```

## Route Fields

Common HTTP route fields:

- `method`
- `path`
- `request.body`
- `request.query`
- `request.params`
- `request.headers`
- `responses`
- `options`

WebSocket routes use `messages.client` and `messages.server` instead of
`responses`.

`router()` accepts shared route fields for a contract tree. Use `pathPrefix` to
join a common path prefix onto every route, `metadata` for shallow shared
metadata, and `commonResponses` for common HTTP responses. Use `commonHeaders`
for headers shared by every route. Route declarations win on exact key
conflicts. Header declarations are validated case-insensitively, and
`content-type` is reserved for body handling.
`route()` is a single-route convenience helper whose options are limited to
processing controls like `validate` and `resolveRequestKeys`.

## Schema Libraries

- Runtime validation uses Standard Schema.
- Schemas must validate synchronously.
- Built-in request key inference supports common object schemas from Zod,
  Valibot, and ArkType.
- Other Standard Schema libraries can be used by providing
  `request.requestKeys` or `resolveRequestKeys(schema)` when request keys cannot
  be inferred automatically.
- Use `type<T>()` for type-only schemas when runtime validation is unnecessary
  or handled elsewhere. It is a Standard Schema-compatible no-op validator that
  returns the input value as `T`.
- OpenAPI generation requires a schema converter for the chosen schema library.
- Flattened request keys are unique across `body`, `query`, `params`, and
  `headers`. The `context` key is reserved for adapter handler context.

## Responses

HTTP routes declare all known status codes in `responses`.

```ts
import { noBody, streamBody } from "@contract-first-api/core";

export const apiContract = router({
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
		remove: {
			method: "DELETE",
			path: "/todos/:id",
			request: {
				params: z.object({ id: z.string() }),
			},
			responses: {
				204: noBody(),
			},
		},
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: streamBody(z.object({ type: z.string() })),
			},
		},
	},
});
```

There is no separate `response`, `successStatusCode`, or `errors` field. Status
codes are the keys in `responses`; non-2xx responses are typed error cases.

## Route Shapes

- HTTP
  Default mode. Supports request schemas and status-keyed responses. JSON object
  body schemas are flattened into client and service inputs.
- headers
  Use `request.headers` as a record of header names to schemas. Header fields
  are flattened into client and service inputs like params, query, and body
  fields.
- no body
  Omit `request.body` as shorthand for no request body, or use `body: noBody()`
  to declare it explicitly. Use `noBody()` in `responses` for response statuses
  that have no body.
- custom body
  Use `customBody({ schema, contentType })` in `request.body` when the request
  body should be treated as one whole `body` value instead of flattened fields.
- streaming
  Use `streamBody(schema)` as the successful response value. A stream response
  cannot be mixed with multiple successful status codes.
- `websocket`
  Uses `options: { mode: "websocket" }`. Must use `GET` and define
  `messages.client` and `messages.server`.

## Client

Use `initClient(apiContract, options)` from core.

```ts
const api = initClient(apiContract, {
	baseUrl: "http://localhost:3001",
	getHeaders: () => ({
		Authorization: `Bearer ${getAuthToken()}`,
	}),
	timeoutMs: 10_000,
});
```

- `fetchResponse()` returns declared or undeclared response envelopes.
- `fetch()` exists only when the route has exactly one successful response
  and returns that success body directly.
- WebSocket routes expose `openConnection()`.

## Invariants

- Contract keys like `todos.create` become stable path names for helper types
  and integrations.
- Request field names must be unique across `body`, `query`, `params`, and
  `headers` for one route.
- Every HTTP route must declare at least one successful response.
- The API contract is a plain object and can be organized across files with
  normal object composition.

## Use This Package When

- adding or changing routes at the contract level
- deriving shared request and response types
- creating typed runtime clients
