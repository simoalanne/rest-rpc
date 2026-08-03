# @contract-first-api/express

Mount a shared contract tree on an Express app with request validation, typed
service handlers, middleware hooks, typed request context, streaming responses,
and websocket routes.

This package consumes contracts from `@contract-first-api/core`; it does not
define contracts itself.

## Install

```bash
pnpm add @contract-first-api/express express
```

If your contract tree includes websocket routes, also install `ws` and its
types:

```bash
pnpm add ws
pnpm add -D @types/ws
```

## Basic Setup

Start by calling `initServer()` to get helper functions. Add middlewares with
`defineMiddleware()`, implement contract groups or single contracts with
`implementContract()`, then call `createRouter()` to register those
implementations.

```ts
import { initServer } from "@contract-first-api/express";
import { contracts } from "@example/shared";
import express from "express";

type RequestContext = {
	userId?: string;
};

const app = express();
app.use(express.json());

const { createRouter, defineMiddleware, implementContract } = initServer<
	typeof contracts,
	RequestContext
>();

declare global {
	namespace Express {
		interface Request {
			userId?: string;
		}
	}
}

const authMiddleware = defineMiddleware((req, res, next) => {
	if (!req.contract.meta?.requiresAuth) {
		next();
		return;
	}

	const token = req.headers.authorization?.replace("Bearer ", "");
	if (!token) {
		res.sendStatus(401);
		return;
	}

	req.userId = verifyAuthToken(token);
	next();
});

const todoImplementations = implementContract(contracts.todos).handlers({
	async list() {
		return {
			status: 200,
			body: {
				items: await getTodos(),
			},
		};
	},
	async create({ title, context }) {
		const todo = await createTodo({ title, ownerId: context.userId });

		return {
			status: 201,
			body: todo,
		};
	},
});

createRouter({
	app,
	contracts,
	implementations: [todoImplementations],
	routePrefix: "/api",
	middlewares: [authMiddleware],
	createContext: (req) => ({
		userId: req.userId,
	}),
});
```

## Service Responses

HTTP service handlers return a declared response envelope:

```ts
return {
	status: 200,
	body: {
		items,
	},
};
```

The `status` must be one of the contract's `responses` keys, and `body` must
match the schema declared for that status. Non-2xx responses are normal typed
responses:

```ts
const createTodoImplementation = implementContract(contracts.todos.create).handler(
	({ title }) => {
		if (todoExists(title)) {
			return {
				status: 409,
				body: {
					code: "TITLE_ALREADY_EXISTS",
				},
			};
		}

		return {
			status: 201,
			body: createTodo(title),
		};
	},
);
```

For `noBody` responses, return `body: undefined`:

```ts
return {
	status: 204,
	body: undefined,
};
```

Unexpected service errors are not swallowed; they continue to the Express
global error handler.

When a contract declares exactly one successful status, the handler may return
that successful body directly:

```ts
const todoImplementations = implementContract(contracts.todos).handlers({
	async list() {
		return {
			items: await getTodos(),
		};
	},
});
```

## Request Flow

For each contract route:

1. request validation runs first
2. custom middlewares run after validation
3. `createContext` runs after middlewares
4. the service handler runs last

If validation fails, middleware, context creation, and the service handler do
not run.

## Validated Request Shape

Handlers receive one flattened request object:

- fields from `params`
- fields from `query`
- fields from `body`
- `context`

```ts
const todoImplementations = implementContract(contracts.todos).handlers({
	async get({ id, includeCompleted, context }) {
		const todo = await loadTodo({
			id,
			includeCompleted,
			userId: context.userId,
		});

		return {
			status: 200,
			body: todo,
		};
	},
});
```

Request field names must be unique across locations in a single contract.

## Raw Body Handling

If the contract tree mixes raw and non-raw routes, prefer
`createContractModeMiddleware()` so parsing is chosen from the contract tree
instead of hardcoded route paths.

```ts
app.use(
	createContractModeMiddleware({
		contracts,
		routePrefix: "/api",
		nonRaw: express.json(),
		raw: express.raw({
			type: ["image/png", "image/jpeg"],
		}),
	}),
);
```

Raw service handlers receive `rawBody` in addition to typed params, query, and
context:

```ts
const imageImplementations = implementContract(contracts.images).handlers({
	inspect({ rawBody }) {
		return {
			status: 200,
			body: inspectImage(rawBody),
		};
	},
});
```

## Middleware

Use `defineMiddleware()` when middleware needs typed contract metadata.

```ts
const authMiddleware = defineMiddleware((req, res, next) => {
	if (!req.contract.meta?.requiresAuth) {
		next();
		return;
	}

	if (!req.headers.authorization) {
		res.sendStatus(401);
		return;
	}

	next();
});
```

Custom middlewares run after request validation and before `createContext`.
That means middleware can read `req.contract`, inspect validated request data,
and attach values to the Express request for `createContext` to use.

For middleware declared outside `defineMiddleware()`, the package exports
`RequestWithContract`.

## Streaming Responses

Streaming responses are declared with `stream(schema)` in the contract. Service
handlers can return the async iterable directly when the contract has one
successful status.

```ts
const todoImplementations = implementContract(contracts.todos).handlers({
	events() {
		return readTodoEvents();
	},
});
```

The route writes each yielded value as NDJSON with
`content-type: application/x-ndjson`.

## WebSocket Routes

For contracts with `options: { mode: "websocket" }`, `createRouter()` registers
an upgrade handler on the provided HTTP server. The `server` option is required
when websocket contracts are present.

```ts
import { initServer } from "@contract-first-api/express";
import { contracts } from "@example/shared";
import express from "express";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);

const { createRouter, implementContract } = initServer<typeof contracts>();

const discussImplementations = implementContract(contracts.discuss).handlers({
	connect({ socket }) {
		socket.send({
			type: "history",
			messages: [],
		});

		socket.onMessage((result) => {
			if (!result.success) return;

			socket.send({
				type: "message",
				text: result.data.text,
			});
		});
	},
});

createRouter({
	app,
	server,
	contracts,
	implementations: [discussImplementations],
	routePrefix: "/api",
});

server.listen(3001);
```

Invalid incoming websocket messages call `onMessage` with `{ success: false }`.
The library does not decide what that means for your application.

## Route Registration

`createRouter()` registers one Express route for every non-websocket contract
leaf. WebSocket contracts are registered on the underlying HTTP server's
upgrade event.

```ts
createRouter({
	app,
	contracts,
	implementations,
	routePrefix: "/api",
});
```

The registered path is `routePrefix + contract.path`. Static routes are ordered
before parameter routes when paths overlap.

## How It Connects

- Define contracts with `@contract-first-api/core`.
- Import the same contracts into your backend.
- Register them with `initServer()` and `createRouter()`.
- Use `initClient()` from `@contract-first-api/core` on the frontend with the
  same contract tree and matching `baseUrl`.

This package stays on the server side. The core client, React Query adapter,
and core OpenAPI generator are optional consumers of the same contracts.
