# @contract-first-api/core

Use this reference for defining contract trees and reasoning about shared
contract behavior.

## Purpose

`@contract-first-api/core` defines shared API contracts and helper types. It
does not mount routes or make HTTP requests.

## Main API

Start with `initContracts()`, optionally with a metadata shape, then create the
tree with `defineContractTree()`.

Avoid circular dependencies by declaring `initContracts()` once per repository
outside the main `index.ts` entry point.

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContractTree } = initContracts<{
	requiresAuth?: boolean;
}>();

export const contracts = defineContractTree({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			response: z.object({
				items: z.array(
					z.object({
						id: z.string(),
						title: z.string(),
					}),
				),
			}),
		},
	},
});
```

Common JSON route:

```ts
export const contracts = defineContractTree({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			request: {
				params: z.object({
					id: z.string(),
				}),
			},
			response: z.object({
				id: z.string(),
				title: z.string(),
			}),
		},
	},
});
```

Route with metadata:

```ts
export const contracts = defineContractTree({
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			meta: {
				requiresAuth: true,
			},
			request: {
				body: z.object({
					title: z.string().min(1),
				}),
			},
			response: z.object({
				id: z.string(),
				title: z.string(),
			}),
		},
	},
});
```

## Contract Fields

Common fields:

- `method`
- `path`
- `request.body`
- `request.query`
- `request.params`
- `response`
- `successStatusCode`
- `errors`
- `options`
- `messages`
- `meta`

## Contract Modes

- `json`
  Default mode. Supports request schemas, optional response schema, known
  errors, and metadata.
- `raw`
  Uses `options: { mode: "raw" }`. Can define `query`, `params`, response, and
  errors, but not a contract-managed request body.
- `stream`
  Uses `options: { mode: "stream" }`. Must define a response chunk schema.
- `websocket`
  Uses `options: { mode: "websocket" }`. Must use `GET` and define
  `messages.client` and `messages.server`.

Mode examples:

```ts
export const rawContracts = defineContractTree({
	uploadImage: {
		method: "POST",
		path: "/images/:imageId",
		request: {
			params: z.object({
				imageId: z.string(),
			}),
		},
		options: { mode: "raw" },
		response: z.object({
			ok: z.boolean(),
		}),
	},
});
```

```ts
export const streamContracts = defineContractTree({
	watchEvents: {
		method: "GET",
		path: "/events",
		options: { mode: "stream" },
		response: z.object({
			type: z.string(),
		}),
	},
});
```

```ts
export const websocketContracts = defineContractTree({
	chat: {
		method: "GET",
		path: "/chat",
		options: { mode: "websocket" },
		messages: {
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		},
	},
});
```

## Invariants

- Contract keys like `todos.create` become stable path names for helper types
  and integrations.
- Request field names must be unique across `body`, `query`, and `params` for
  one contract.
- Contracts are plain objects and can be organized across files with normal
  object composition.
- `defineContractTree()` performs runtime validation for structural mistakes
  that TypeScript alone cannot enforce.

## Use This Package When

- adding or changing routes at the contract level
- introducing metadata used by middleware or integrations
- changing contract mode between `json`, `raw`, `stream`, or `websocket`
- deriving shared request, response, or error types
