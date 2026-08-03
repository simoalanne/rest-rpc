# @contract-first-api/core

Use this reference for defining the API contract, deriving shared types, and
creating typed clients.

## Purpose

`@contract-first-api/core` defines a shared API contract, helper types, response
helpers, and the runtime client.

## Main API

Create the API contract with `defineContract()`.

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
- `responses`
- `options`

WebSocket routes use `messages.client` and `messages.server` instead of
`responses`.

## Responses

HTTP routes declare all known status codes in `responses`.

```ts
import { noBody, stream } from "@contract-first-api/core";

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
		remove: {
			method: "DELETE",
			path: "/todos/:id",
			request: {
				params: z.object({ id: z.string() }),
			},
			responses: {
				204: noBody,
			},
		},
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: stream(z.object({ type: z.string() })),
			},
		},
	},
});
```

There is no separate `response`, `successStatusCode`, or `errors` field. Status
codes are the keys in `responses`; non-2xx responses are typed error cases.

## Route Modes

- `json`
  Default mode. Supports request schemas and responses.
- `raw`
  Uses `options: { mode: "raw" }`. Can define `query`, `params`, and
  responses, but not an API-contract-managed request body.
- streaming
  Use `stream(schema)` as the successful response value. A stream response
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
- WebSocket routes expose `connect()` and `tryConnect()`.

## Invariants

- Contract keys like `todos.create` become stable path names for helper types
  and integrations.
- Request field names must be unique across `body`, `query`, and `params` for
  one route.
- Every HTTP route must declare at least one successful response.
- The API contract is a plain object and can be organized across files with
  normal object composition.

## Use This Package When

- adding or changing routes at the contract level
- deriving shared request and response types
- creating typed runtime clients
