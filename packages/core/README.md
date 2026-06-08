# @contract-first-api/core

Define shared API contracts and derive path-based request, response, and error
types from them.

This is the package every other `contract-first-api` package builds on. It does
not mount routes or make HTTP requests by itself. Its job is to give your app a
single contract tree that can be imported by backend, frontend, tests, and
shared helper types.

## Install

```bash
pnpm add @contract-first-api/core zod
```

## Define Contracts

Start by calling `initContracts()` optionally with the metadata shape, then define a contract
tree with `defineContractTree()`.

The helper exists because it allows the metadata type to flow though the stack instead of needing to be imported separately in each package. Additionally `defineContractTree()` performs some runtime validation to catch common mistakes that can't be enforced at compile time and makes sure the object type does not widen and is correctly defined without you having to add annotations like `as const satisfies Contract<MetaShape>` for every contract tree.

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

The keys around each contract, like `todos.create`, become the path names used
by helper types and integration packages.

## Merging Contract Trees

There is no special merging function but because contracts are just plain objects you can just use regular object spread and organize your contract tree across multiple files however you like.

```ts
// contracts/index.ts
import { defineContractTree } from "@contract-first-api/core";

// contracts defined using defineContractTree in separate files.
import { userContracts } from "./user-contracts";
import { todoContracts } from "./todo-contracts";

export default {
	...userContracts,
	...todoContracts,
};
```


## Contract Fields

Each contract can define:

| Field | Purpose |
| --- | --- |
| `method` | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. |
| `path` | HTTP path, with params using `:paramValue` syntax. |
| `request` | Optional Zod schemas for `body`, `query`, and `params`. |
| `response` | Optional Zod schema for the successful JSON response body, or required stream chunk schema for stream contracts. |
| `errors` | Optional known error schema or array of known error schemas. |
| `options` | Optional contract behavior, such as stream or websocket mode. |
| `messages` | WebSocket client and server message schemas. |
| `meta` | Optional app-defined metadata for integrations and middleware. |

Contracts are plain objects. The package validates a few structural rules that cannot be enforced at compile time when
you call `defineContractTree()`, but it does not require code generation or a
separate schema compiler step.

## Contract Types

Contracts have three explicit shapes:

- **JSON contracts** are the default. `options` can be omitted or set to
  `{ mode: "json" }`. They can define request schemas, an optional `response`
  schema, known errors, and metadata.
- **Stream contracts** use `options: { mode: "stream" }`. They must define a
  `response` schema, which describes each NDJSON chunk.
- **WebSocket contracts** use `options: { mode: "websocket" }`. They must use
  `method: "GET"` and define `messages.client` and `messages.server`. They do
  not define `response`, because successful communication happens through
  websocket messages after the upgrade.

The integration packages use the contract mode to expose the right API. JSON
contracts expose fetch helpers, stream contracts expose stream helpers, and
websocket contracts expose connect helpers.

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
			response: z.object({
				id: z.string(),
				title: z.string(),
			}),
		},
		create: {
			method: "POST",
			path: "/todos",
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

The integration packages expose this as one flat request object. For example,
`params.id`, `query.includeCompleted`, and `body.title` become regular fields
on typed service/client inputs.

Request field names must be unique across `body`, `query`, and `params` for a
single contract. This avoids ambiguous flat inputs.

## Responses

If a contract has a `response` schema, server handlers must return that shape
and clients receive that inferred type.

If a contract omits `response`, then there simply is no typed response body.

## Known Errors

Use `errors` for error payloads your application intentionally returns and wants
to handle as typed cases.

```ts
const contracts = defineContractTree({
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: z.object({
					title: z.string().min(1),
				}),
			},
			errors: [
				z.object({
					code: z.literal("TITLE_ALREADY_EXISTS"),
					existingTodoId: z.string(),
				}),
				z.object({
					code: z.literal("TODO_LIMIT_REACHED"),
					status: z.literal(400),
					maxLimit: z.int(),
					currentCount: z.int(),
				}),
			],
			response: z.object({
				id: z.string(),
				title: z.string(),
			}),
		},
	},
});
```

Each known error schema must include a literal `code`. It may also include a
literal `status` which can be used by the backend to set the HTTP status code. You can also add any other fields you want on the error payload.

## Streaming Contracts

Streaming contracts use `options: { mode: "stream" }`. The `response` schema
describes each stream chunk.

```ts
const contracts = defineContractTree({
	todos: {
		events: {
			method: "GET",
			path: "/todos/events",
			options: { mode: "stream" },
			response: z.discriminatedUnion("type", [
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
		},
	},
});
```

Stream contracts must define a `response` schema because the client validates each chunk.

## WebSocket Contracts

WebSocket contracts use `options: { mode: "websocket" }`. They define the JSON
message shape each side is allowed to send.

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
				server: z.discriminatedUnion("type", [
					z.object({
						type: z.literal("history"),
						messages: z.array(z.string()),
					}),
					z.object({
						type: z.literal("message"),
						text: z.string(),
					}),
				]),
			},
		},
	},
});
```

The client message schema is used for messages sent by the API client to the
backend. The server message schema is used for messages sent by the backend to
the API client. Incoming websocket messages are parsed and exposed as a result
object so application code can decide how to handle invalid messages.

## Metadata

Use `meta` for app-specific information that integrations can read at runtime.
For example, Express middleware can check whether a route requires auth before
the service handler runs.

```ts
const { defineContractTree } = initContracts<{
	requiresAuth?: boolean;
}>();

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

Metadata is intentionally open-ended. It is useful for things like auth flags,
required permissions, rate-limit groups, or feature gates.

## Shared Helper Types

Most app code should not need to import the internal contract machinery. The
core package exposes path-based helper types for shared packages that want
friendly aliases.

This allows your shared package to export helper types like this:

```ts
import type {
	ContractApiError,
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

export type ApiError<P extends ApiPath> = ContractApiError<AppContracts, P>;
```

Then your backend and frontend can work with easier to work with types and don't need to import contracts themeselves:

```ts
type CreateTodoInput = ApiRequest<"todos.create">;
type CreatedTodo = ApiResponse<"todos.create">;
type CreateTodoError = ApiError<"todos.create">;
```

## How the core package connects to other packages

- `@contract-first-api/express` imports the same contract tree to register
  routes, validate requests, and type service handlers.
- `@contract-first-api/api-client` imports the same contract tree to create a
  typed runtime client.
- `@contract-first-api/react-query` wraps the API client tree with hooks and
  cache helpers.
