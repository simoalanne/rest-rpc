# @contract-first-api/express

Mount a shared API contract on an Express app with request validation, typed
service handlers, typed request context, route matching helpers, streaming
responses, and WebSocket routes.

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
middleware to the Express app when you need application-specific request
handling.

```ts
import { initServer, matchRoute } from "@contract-first-api/express";
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
	const matched = matchRoute({ contract: apiContract, req });

	if (!matched?.route.path.startsWith("/api/todos")) {
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

app.use(authMiddleware);

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
	implementations: [todoImplementations],
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

If the contract contains both JSON and raw body routes, you can use `matchRoute()` 
helper to determine which body parser to use for each request.

```ts
const jsonBodyParser = express.json();
const rawBodyParser = express.raw({
	type: ["image/png", "image/jpeg"],
});

app.use((req, res, next) => {
	const matched = matchRoute({ contract, req });
	const bodyParser =
		matched?.route.options?.mode === "raw" ? rawBodyParser : jsonBodyParser;

	return bodyParser(req, res, next);
});
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

Use regular Express middleware for application-specific request handling. When
middleware needs to know which contract route matched, call `matchRoute()`.

```ts
const authMiddleware: express.RequestHandler = (req, res, next) => {
	const matched = matchRoute({ contract: apiContract, req });

	if (!matched?.route.path.startsWith("/api/todos")) {
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

The library does not manage an application middleware phase. Middleware can
attach values to the Express request however your app chooses, and
`createContext` can read those values.

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
	implementations: [discussImplementations],
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
	implementations,
});
```

The registered path is the route declaration's `path`. Use
`defineContract(..., { pathPrefix: "/api" })` when every route should share a
common path prefix. Static routes are ordered before parameter routes when paths
overlap.

## How It Connects

- Define `apiContract` with `@contract-first-api/core`.
- Import the same contract into your backend.
- Register it with `initServer()` and `createRouter()`.
- Use `initClient()` from `@contract-first-api/core` on the frontend with the
  same API contract and a deployment `baseUrl`.

This package stays on the server side. The core client, React Query adapter,
and core OpenAPI generator are optional consumers of the same contract.
