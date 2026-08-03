# @contract-first-api/core

Use this reference for defining contract trees, deriving shared types, and
creating typed clients.

## Purpose

`@contract-first-api/core` defines shared API contracts, helper types, response
helpers, and the runtime client.

## Main API

Start with `initContracts()`, then create the tree with `defineContract()`.

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContract } = initContracts();

export const contracts = defineContract({
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

## Contract Fields

Common HTTP contract fields:

- `method`
- `path`
- `request.body`
- `request.query`
- `request.params`
- `responses`
- `options`

WebSocket contracts use `messages.client` and `messages.server` instead of
`responses`.

## Responses

HTTP contracts declare all known status codes in `responses`.

```ts
import { noBody, stream } from "@contract-first-api/core";

export const contracts = defineContract({
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

## Contract Modes

- `json`
  Default mode. Supports request schemas and responses.
- `raw`
  Uses `options: { mode: "raw" }`. Can define `query`, `params`, and
  responses, but not a contract-managed request body.
- streaming
  Use `stream(schema)` as the successful response value. A stream response
  cannot be mixed with multiple successful status codes.
- `websocket`
  Uses `options: { mode: "websocket" }`. Must use `GET` and define
  `messages.client` and `messages.server`.

## Client

Use `initClient(contracts, options)` from core.

```ts
const api = initClient(contracts, {
	baseUrl: "http://localhost:3001/api",
	getHeaders: () => ({
		Authorization: `Bearer ${getAuthToken()}`,
	}),
	timeoutMs: 10_000,
});
```

- `fetchResponse()` returns declared or undeclared response envelopes.
- `fetch()` exists only when the contract has exactly one successful response
  and returns that success body directly.
- websocket contracts expose `connect()` and `tryConnect()`.

## Invariants

- Contract keys like `todos.create` become stable path names for helper types
  and integrations.
- Request field names must be unique across `body`, `query`, and `params` for
  one contract.
- Every HTTP contract must declare at least one successful response.
- Contracts are plain objects and can be organized across files with normal
  object composition.

## Use This Package When

- adding or changing routes at the contract level
- deriving shared request and response types
- creating typed runtime clients
