# contract-first-api

Define API contracts once, then reuse them for runtime validation, typed Express
handlers, typed HTTP clients, and optional React Query hooks.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Zod-4.3-3E67B1?logo=zod&logoColor=white)](https://zod.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-5.0-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)

`contract-first-api` is a small TypeScript toolkit for keeping REST APIs aligned
across your stack. You describe each endpoint as a plain contract object, then
the rest of the packages use that same contract tree to validate requests, type
server handlers, build a runtime client, and wrap that client with React Query.

The goal is to keep normal HTTP semantics while getting the developer
experience people usually reach for RPC libraries to get: typed handlers, typed
client calls, inferred request and response shapes, and no duplicated DTOs.

## Why It Exists

Most TypeScript API stacks end up choosing between a few awkward tradeoffs:

- manually duplicate request and response types between backend and frontend
- generate a client from a schema compiler and fit your workflow around it
- adopt an RPC-style framework and let it shape your backend structure
- keep runtime validation separate from the types users actually consume

This library takes a smaller route. Contracts are plain TypeScript objects with
Zod schemas, sort of like a mini DSL. They are decoupled from your route implementation, so you can keep
your own project structure, Express setup, middleware, and HTTP route design.

## Core Idea

One contract tree is the source of truth.

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContractTree } = initContracts();

export const contracts = defineContractTree({
	todos: {
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

From that tree:

- `@contract-first-api/express` validates incoming requests and types services
- `@contract-first-api/api-client` builds a typed runtime HTTP client
- `@contract-first-api/react-query` wraps the client with typed hooks and cache helpers
- your shared package can expose path-based request, response, and error types

## Features

- **Shared contracts:** define `body`, `query`, `params`, responses, and known
  errors with Zod schemas.
- **Typed server handlers:** Express services receive validated request fields
  and typed context inferred from your setup.
- **Typed HTTP client:** the client mirrors your contract tree and validates
  backend responses at runtime.
- **Metadata extension points:** attach route metadata for things like auth
  requirements, then read it from middleware or context creation.
- **Known errors:** describe expected error payloads in the contract and handle
  them with typed client errors.
- **Streaming:** model NDJSON endpoints with fetch streams.
- **React Query adapter:** optionally turn the typed client into hooks and cache
  helpers.
- **No code generation:** contracts are plain objects and regular TypeScript
  inference does the work.

## Packages

| Package | Role |
| --- | --- |
| [`@contract-first-api/core`](./packages/core/README.md) | Define contracts and derive shared helper types. |
| [`@contract-first-api/express`](./packages/express/README.md) | Mount contracts on an Express app with validation and typed services. |
| [`@contract-first-api/api-client`](./packages/api-client/README.md) | Create a typed runtime HTTP client from the contract tree. |
| [`@contract-first-api/react-query`](./packages/react-query/README.md) | Wrap the API client with React Query hooks and cache helpers. |

## Install

Install the core package wherever you define shared contracts:

```bash
pnpm add @contract-first-api/core
```

Then add the integration packages you need:

```bash
pnpm add @contract-first-api/express @contract-first-api/api-client @contract-first-api/react-query
```

## Quick Flow

Define contracts in a shared package:

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
				ownerId: z.string().optional(),
			}),
		},
	},
});
```

Mount them on Express:

```ts
import { initServer } from "@contract-first-api/express";
import { contracts } from "@example/shared";
import express from "express";

type RequestContext = {
	userId?: string;
};

const app = express();
app.use(express.json());

const { createRouter, defineMiddleware, defineService } = initServer<
	typeof contracts,
	RequestContext
>();

declare global {
	namespace Express {
		interface Request {
			// .contract: Contract; Added by the library automatically.
			// .validatedRequest: Record<string, unknown>; Also added by the library automatically.
			userId?: string;
		}
	}
}

const authMiddleware = defineMiddleware((req, res, next) => {
	// if you use the defineMiddleware helper .meta is typed correctly. 
	// otherwise it's unknown type.
	if (!req.contract.meta?.requiresAuth) {
		next();
		return;
	}

	// headers are not typed but contain exactly what was sent by the client.
	const token = req.headers.authorization?.replace("Bearer ", "");
	if (!token) {
		res.sendStatus(401);
		return;
	}

	const userId = verifyAuthToken(token);

	if (!userId) {
		res.sendStatus(401);
		return;
	}

	req.userId = userId;
	next();
});

const services = {
	todos: defineService("todos", {
		async list() {
			return await getTodos();
		},
		async create({ title, context }) {
			const newTodo = await createTodo({ title, ownerId: context.userId });
			return newTodo;
		},
	}),
};

createRouter({
	app,
	contracts,
	services,
	routePrefix: "/api",
	// provided middlewares run after request is validated
	middlewares: [authMiddleware],
	// createContext runs after all middlewares have run
	createContext: (req) => ({
		userId: req.userId,
	}),
});
```

Create a typed client wherever you need to call the API:

```ts
import { ApiClient } from "@contract-first-api/api-client";
import { contracts } from "@example/shared";

const client = new ApiClient({
	baseUrl: process.env.API_BASE_URL,
	contracts,
});

// headers are not typed but are passed through to fetch as usual.
client.setHeaders(() => ({
	Authorization: `Bearer ${getAuthToken()}`,
}));

const todos = await client.api.todos.list.fetch();
const created = await client.api.todos.create.fetch({
	title: "Write the README",
});
```

Optionally wrap it with React Query if you're in a React app:

```ts
import createAdapter from "@contract-first-api/react-query";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();
export const api = createAdapter(client.api, queryClient);
```

```tsx
const todos = api.todos.list.useQuery();
const createTodo = api.todos.create.useMutation();
```

## Recommended Setup

Typically you want to have your contract definitions in a separate workspace package used by your backend and frontend(s). For example:

- `shared` exports the contract tree
- `backend` imports the contracts and registers Express routes
- `frontend` imports the contracts and creates an API client
- app-specific helper types can live beside the contracts

This keeps the contract definition independent from the backend route
implementation. You can organize services, middleware, context, and frontend
data fetching however your app already wants to.

## Non-Goals

This library is intentionally small. It is not trying to be:

- a code generator or schema compiler
- a full backend framework
- a replacement for Express, fetch, Zod, or React Query
- an RPC framework that owns your route structure
- a project structure or architecture mandate
- a solution for every possible API edge case

The aim is to cover common REST API workflows with low ceremony, then leave escape hatches where your application needs something more specific.

## Design Principles

- Public API is small and easy to learn.
- Type inference does the heavy lifting
- Runtime behavior is straightforward and easy to debug.
- Contracts should be plain objects, not generated artifacts.
- Framework integrations should stay separate and optional.

## Docs

- [Core package](./packages/core/README.md)
- [Express package](./packages/express/README.md)
- [API client package](./packages/api-client/README.md)
- [React Query package](./packages/react-query/README.md)
- [Example project](./example/README.md)

## License

MIT
