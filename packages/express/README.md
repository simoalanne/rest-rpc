# @contract-first-api/express

Mount a shared API contract on an Express app with request validation, typed
service handlers, middleware hooks, typed request context, streaming responses,
and WebSocket routes.

This package consumes the API contract from `@contract-first-api/core`; it does
not define the contract itself.

## Install

```bash
pnpm add @contract-first-api/express express
```

If your API contract includes WebSocket routes, also install `ws` and its
types:

```bash
pnpm add ws
pnpm add -D @types/ws
```

## Basic Setup

Start by calling `initServer()` to get helper functions. Implement contract
fragments or single route declarations with `implementContract()`, then call
`createRouter()` to register those implementations. Pass regular Express
middlewares to `createRouter()` when they need to run after contract request
validation.

```ts
import { initServer } from "@contract-first-api/express";
import { apiContract } from "@example/shared";
import express from "express";

type RequestContext = {
	userId?: string;
};

const app = express();
app.use(express.json());

const { createRouter, implementContract } = initServer<
	typeof apiContract,
	RequestContext
>();

declare global {
	namespace Express {
		interface Request {
			userId?: string;
		}
	}
}

const authMiddleware: express.RequestHandler = (req, res, next) => {
	if (req.route.path !== "/todos") {
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
};

const todoImplementations = implementContract(apiContract.todos).handlers({
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
	contract: apiContract,
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

The `status` must be one of the route declaration's `responses` keys, and `body` must
match the schema declared for that status. Non-2xx responses are normal typed
responses:

```ts
const createTodoImplementation = implementContract(apiContract.todos.create).handler(
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

When a route declaration declares exactly one successful status, the handler may
return that successful body directly:

```ts
const todoImplementations = implementContract(apiContract.todos).handlers({
	async list() {
		return {
			items: await getTodos(),
		};
	},
});
```

## Request Flow

For each route declaration:

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
const todoImplementations = implementContract(apiContract.todos).handlers({
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

Request field names must be unique across locations in a single route
declaration.

## Helper Types

Inline handlers usually get their types from inference. When handlers move into
separate files, use the route helper types to keep the same request, response,
context, and websocket message types.

```ts
import type {
	InferRouteServerReceivedMessage,
	InferRouteServerSendMessage,
	InferRouteServerSocket,
	InferRouteServiceHandler,
	InferRouteServiceRequest,
	InferRouteServiceResponse,
} from "@contract-first-api/express";
import { apiContract } from "@example/shared";

type CreateTodoHandler = InferRouteServiceHandler<
	typeof apiContract.todos.create,
	RequestContext
>;

export const createTodo: CreateTodoHandler = async ({ title, context }) => {
	const todo = await context.todos.create({ title });

	return {
		status: 201,
		body: todo,
	};
};

type InspectImageRequest = InferRouteServiceRequest<
	typeof apiContract.images.inspect,
	RequestContext
>;

type TodoListResponse = InferRouteServiceResponse<
	typeof apiContract.todos.list
>;

type DiscussSocket = InferRouteServerSocket<
	typeof apiContract.discuss.connect
>;

type IncomingDiscussMessage = InferRouteServerReceivedMessage<
	typeof apiContract.discuss.connect
>;

type OutgoingDiscussMessage = InferRouteServerSendMessage<
	typeof apiContract.discuss.connect
>;
```

## Raw Body Handling

If the API contract mixes raw and non-raw routes, prefer
`createRouteModeMiddleware()` so parsing is chosen from the API contract
instead of hardcoded route paths.

```ts
app.use(
	createRouteModeMiddleware({
		contract: apiContract,
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
const imageImplementations = implementContract(apiContract.images).handlers({
	inspect({ rawBody }) {
		return {
			status: 200,
			body: inspectImage(rawBody),
		};
	},
});
```

## Middleware

Pass regular Express middleware to `createRouter()` when middleware needs the
validated request or matched route before context creation.

```ts
const authMiddleware: express.RequestHandler = (req, res, next) => {
	if (req.route.path !== "/todos") {
		next();
		return;
	}

	if (!req.headers.authorization) {
		res.sendStatus(401);
		return;
	}

	next();
};
```

Custom middlewares run after request validation and before `createContext`.
That means middleware can read `req.route`, inspect validated request data,
and attach values to the Express request for `createContext` to use.

## Streaming Responses

Streaming responses are declared with `stream(schema)` in the route declaration.
Service handlers can return the async iterable directly when the route
declaration has one successful status.

```ts
const todoImplementations = implementContract(apiContract.todos).handlers({
	events() {
		return readTodoEvents();
	},
});
```

The route writes each yielded value as NDJSON with
`content-type: application/x-ndjson`.

## WebSocket Routes

For routes with `options: { mode: "websocket" }`, `createRouter()` registers an
upgrade handler on the provided HTTP server. The `server` option is required
when WebSocket routes are present.

```ts
import { initServer } from "@contract-first-api/express";
import { apiContract } from "@example/shared";
import express from "express";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);

const { createRouter, implementContract } = initServer<typeof apiContract>();

const discussImplementations = implementContract(apiContract.discuss).handlers({
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
	contract: apiContract,
	implementations: [discussImplementations],
	routePrefix: "/api",
});

server.listen(3001);
```

Invalid incoming websocket messages call `onMessage` with `{ success: false }`.
The library does not decide what that means for your application.

## Route Registration

`createRouter()` registers one Express route for every non-WebSocket route
declaration. WebSocket routes are registered on the underlying HTTP server's
upgrade event.

```ts
createRouter({
	app,
	contract: apiContract,
	implementations,
	routePrefix: "/api",
});
```

The registered path is `routePrefix + route.path`. Static routes are ordered
before parameter routes when paths overlap.

## How It Connects

- Define `apiContract` with `@contract-first-api/core`.
- Import the same contract into your backend.
- Register it with `initServer()` and `createRouter()`.
- Use `initClient()` from `@contract-first-api/core` on the frontend with the
  same API contract and matching `baseUrl`.

This package stays on the server side. The core client, React Query adapter,
and core OpenAPI generator are optional consumers of the same contract.
