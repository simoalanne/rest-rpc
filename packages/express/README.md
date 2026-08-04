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

Implement contract fragments or single route declarations with
`implementContract()`, then call `createRouter()` to register those
implementations. Use `.withContext()` when a route fragment needs request-local
dependencies. Pass regular Express middleware to the Express app when you need
application-specific request handling.

```ts
import {
	createRouter,
	implementContract,
	matchRoute,
	type CreateContextArgs,
} from "@contract-first-api/express";
import { apiContract } from "@example/shared";
import express from "express";

type TodoContext = {
	userId?: string;
};

const app = express();
app.use(express.json());

declare global {
	namespace Express {
		interface Request {
			userId?: string;
		}
	}
}

const authMiddleware: express.RequestHandler = (req, res, next) => {
	const matched = matchRoute(apiContract, req);

	if (!matched?.path.startsWith("/api/todos")) {
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

const createTodoContext = ({ req }: CreateContextArgs): TodoContext => ({
	userId: req.userId,
});

const todoImplementations = implementContract(apiContract.todos)
	.withContext(createTodoContext)
	.handlers({
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

Handlers can also throw `ContractResponseError` when returning a declared error
response would make service flow awkward:

```ts
import { ContractResponseError } from "@contract-first-api/express";

throw new ContractResponseError(apiContract.todos.get, {
	status: 404,
	body: {
		code: "TODO_NOT_FOUND",
	},
});
```

The response must match a non-2xx response declared by that route. The Express
adapter serializes `ContractResponseError` automatically. Application-specific
error classes still pass through to the Express global error handler, where you
can implement your own global error handling.

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

For each HTTP route declaration:

1. request validation runs first
2. the implementation context factory runs, if `.withContext()` was used
3. the service handler runs last

If validation fails, context creation and the service handler do not run.

## Validated Request Shape

Handlers receive one flattened request object:

- fields from `params`
- fields from `query`
- fields from `body`
- `context`, only when the implementation uses `.withContext()`

```ts
const todoImplementations = implementContract(apiContract.todos)
	.withContext(createTodoContext)
	.handlers({
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
declaration. For implementations that use `.withContext()`, `context` is also
reserved for the context value.

## Implementation Context

Use `.withContext()` when an HTTP route implementation needs request-local
dependencies or facts prepared by middleware:

```ts
const createTodoContext = ({ req }: CreateContextArgs) => ({
	userId: req.userId,
	todos: makeTodoService(req.db),
});

const todoImplementations = implementContract(apiContract.todos)
	.withContext(createTodoContext)
	.handlers(todoHandlers);
```

The context factory receives the Express request, the matched route declaration,
and loosely typed validated input as `Record<string, unknown>`. If it throws or
rejects, Express handles the error like any other async route failure.

`.withContext()` is intentionally single-use and only supports HTTP routes. If a
contract subtree mixes HTTP and WebSocket routes, split the implementation into
HTTP and WebSocket fragments:

```ts
const todoHttpImplementations = implementContract({
	list: apiContract.todos.list,
	create: apiContract.todos.create,
})
	.withContext(createTodoContext)
	.handlers({
		list,
		create,
	});

const todoSocketImplementation = implementContract(apiContract.todos.updates)
	.handler(handleTodoUpdates);
```

## Helper Types

Inline handlers usually get their types from inference. When handlers move into
separate files, use the route helper types to keep the same request, response,
HTTP context, and websocket message types. Pass a context type only for handlers
registered behind `.withContext()`. `InferRouteServiceRequest` describes the
route request fields only; add `& { context: YourContext }` if you want a
standalone contextual request type.

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

type RequestContext = {
	todos: {
		create(input: { title: string }): Promise<unknown>;
	};
};

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
	typeof apiContract.images.inspect
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

## Custom Body Handling

If the contract contains both default JSON bodies and custom bodies, you can use
`matchRoute()` to determine which body parser to use for each request.

```ts
import { isCustomBody, matchRoute } from "@contract-first-api/express";

const jsonBodyParser = express.json();

const getCustomBodyParser = (contentType: string) => {
	switch (contentType) {
		case "application/octet-stream":
			return express.raw({ type: contentType });
		case "application/json":
			return express.json({ type: contentType });
		default:
			throw new Error(`Unsupported custom body content type: ${contentType}`);
	}
};

app.use((req, res, next) => {
	const matched = matchRoute(contract, req);
	const body = matched?.request?.body;
	const bodyParser = isCustomBody(body)
		? getCustomBodyParser(body.contentType)
		: jsonBodyParser;

	return bodyParser(req, res, next);
});
```

Custom body service handlers receive the parsed request body as `body` in
addition to typed params and query fields:

```ts
const imageImplementations = implementContract(apiContract.images).handlers({
	inspect({ body }) {
		return {
			status: 200,
			body: inspectImage(body),
		};
	},
});
```

## Middleware

Use regular Express middleware for application-specific request handling. When
middleware needs to know which contract route matched, call `matchRoute()`.

```ts
const authMiddleware: express.RequestHandler = (req, res, next) => {
	const matched = matchRoute(contract, req);

	if (matched?.metadata?.auth === "required") {
		const user = gerUserFromAuthHeader(req.headers.authorization);
		if (!user) {
			res.status(401).json({ error: "Unauthorized" });
			return;
		}
		req.user = user;
		next();
	}

	next();
};
```

The library does not manage an application middleware phase. Middleware can
attach values to the Express request however your app chooses, and
`.withContext()` context factories can read those values from their `req`
argument.

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
import { createRouter, implementContract } from "@contract-first-api/express";
import { apiContract } from "@example/shared";
import express from "express";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);

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
`router(..., { pathPrefix: "/api" })` when every route should share a
common path prefix. Static routes are ordered before parameter routes when paths
overlap.

## How It Connects

- Define `apiContract` with `@contract-first-api/core`.
- Import the same contract into your backend.
- Register it with `implementContract()` and `createRouter()`.
- Use `initClient()` from `@contract-first-api/core` on the frontend with the
  same API contract and a deployment `baseUrl`.

This package stays on the server side. The core client, React Query adapter,
and core OpenAPI generator are optional consumers of the same contract.
