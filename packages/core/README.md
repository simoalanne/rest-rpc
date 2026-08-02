# @contract-first-api/core

Define shared API contracts, derive path-based helper types, and create typed
runtime clients from the same contract tree.

## Install

```bash
pnpm add @contract-first-api/core zod
```

## Define Contracts

Start with `initContracts()`, optionally with a metadata shape, then define a
plain contract tree with `defineContractTree()`.

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
			meta: {
				requiresAuth: true,
			},
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

The keys around each contract, like `todos.create`, become the path names used
by helper types and integration packages.

## Contract Fields

Each HTTP contract can define:

| Field | Purpose |
| --- | --- |
| `method` | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. |
| `path` | HTTP path, with params using `:paramValue` syntax. |
| `request` | Optional Zod schemas for `body`, `query`, and `params`. Raw request contracts can only define `query` and `params`. |
| `responses` | Required map of status codes to response schemas. At least one status must be 2xx. |
| `options` | Optional contract behavior, currently `raw` or `websocket`. |
| `messages` | WebSocket client and server message schemas. |
| `meta` | Optional app-defined metadata for integrations and middleware. |

`defineContractTree()` validates structural rules that TypeScript cannot fully
enforce at runtime, such as duplicate request field names across `body`,
`query`, and `params`.

## Responses

Use `responses` for both successful and non-successful status codes. Values can
be Zod schemas, `noBody`, or `stream(schema)`.

```ts
import { noBody, stream } from "@contract-first-api/core";

export const contracts = defineContractTree({
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

## Contract Modes

- **JSON contracts** are the default. They can define request schemas,
  responses, and metadata.
- **Raw request contracts** use `options: { mode: "raw" }`. They can define
  `query`, `params`, responses, and metadata, but not a contract-managed request
  `body` schema.
- **Streaming contracts** are HTTP contracts whose successful response is
  declared with `stream(schema)`. A stream response cannot be mixed with
  multiple successful status codes.
- **WebSocket contracts** use `options: { mode: "websocket" }`. They must use
  `method: "GET"` and define `messages.client` and `messages.server` instead of
  `responses`.

## Request Schemas

Requests are split into the same HTTP locations your backend receives:

```ts
const contracts = defineContractTree({
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

## Raw Request Contracts

Raw request contracts pass the request body through without contract-level Zod
validation while keeping typed params, query, and responses.

```ts
const contracts = defineContractTree({
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

## WebSocket Contracts

WebSocket contracts define the JSON message shape each side is allowed to send.

```ts
const contracts = defineContractTree({
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

const api = initClient(contracts, {
	baseUrl: "http://localhost:3001/api",
	getHeaders: () => ({
		Authorization: `Bearer ${getAuthToken()}`,
	}),
	timeoutMs: 10_000,
});
```

Every HTTP contract exposes `fetchResponse()`, which returns either a declared
response envelope or an undeclared response:

```ts
const response = await api.todos.create.fetchResponse({
	title: "Write docs",
});

if (response.declared && response.status === 201) {
	console.log(response.body.id);
}
```

Contracts with exactly one successful response also expose `fetch()`, which
returns the success body directly:

```ts
const todos = await api.todos.list.fetch();
console.log(todos.items);
```

WebSocket contracts expose `connect()` and `tryConnect()`.

## Shared Helper Types

Shared packages can export friendly path-based helper types:

```ts
import type {
	ContractApiRequest,
	ContractApiResponse,
	DotPaths,
} from "@contract-first-api/core";

export type AppContracts = typeof contracts;
export type ApiPath = DotPaths<AppContracts>;

export type ApiRequest<P extends ApiPath> = ContractApiRequest<
	AppContracts,
	P
>;

export type ApiResponse<P extends ApiPath> = ContractApiResponse<
	AppContracts,
	P
>;
```

`ContractApiResponse` is the declared response envelope union for that path,
such as `{ status: 201; body: CreatedTodo } | { status: 409; body: Conflict }`.

## How Core Connects To Other Packages

- `@contract-first-api/express` imports the same contract tree to register
  routes, validate requests, and type service handlers.
- `@contract-first-api/react-query` creates hook and cache helpers from the
  contract tree and core client options.
- `@contract-first-api/openapi` imports the same contract tree to generate a
  plain OpenAPI document object from JSON contracts.
