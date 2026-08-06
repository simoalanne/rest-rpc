# @contract-first-api/express

Mount a shared API contract on an Express app with request validation, typed
service handlers, route matching helpers, streaming responses, and WebSocket
routes.

This package consumes the API contract from `@contract-first-api/core`; it does
not define the contract itself.

## Install

```bash
pnpm add @contract-first-api/express express
```

If your API contract includes WebSocket routes, also install `ws` and its types:

```bash
pnpm add ws
pnpm add -D @types/ws
```

## HTTP Routes

Use `router()` to bind a HTTP contract subtree to plain service handlers.
Use `route()` for a single HTTP route declaration, and `routes()` to compose
already-built implementation trees against a larger HTTP contract. Register the
resulting implementations with `registerRoutes()`.

```ts
import {
	registerRoutes,
	route,
	router,
	routes,
} from "@contract-first-api/express";
import { apiContract } from "@example/shared";
import express from "express";

const app = express();
app.use(express.json());

const httpContract = {
	health: apiContract.health,
	todos: apiContract.todos,
} as const;

const appRoutes = routes(httpContract, {
	todos: router(httpContract.todos, {
		async list() {
			return {
				status: 200,
				body: {
					items: await getTodos(),
				},
			};
		},
		async create({ title }) {
			const todo = await createTodo({ title });

			return {
				status: 201,
				body: todo,
			};
		},
	}),
	health: {
		get: route(httpContract.health.get, () => ({
			status: 200,
			body: { status: "ok" },
		})),
	},
});

registerRoutes(app, appRoutes);
```

Express validates HTTP request bodies, query values, params, headers, WebSocket
upgrade input, and WebSocket messages received from clients before calling
service handlers. Handler responses, stream chunks, and server WebSocket
messages are also validated before they are sent, and the validated output value
is written to the client.

You can also bind a whole subtree directly from plain handlers:

```ts
const todoRoutes = router(apiContract.todos, todoHandlers);
```

`router(contract, handlers)` expects plain service handlers. If you already
created route implementations with `route()` or smaller `router()` calls, use
`routes(contract, implementations)` to compose and check them:

```ts
const appRoutes = routes(httpContract, {
	health: router(httpContract.health, {
		get: health,
	}),
	todos: router(httpContract.todos, todoHandlers),
});

registerRoutes(app, appRoutes);
```

HTTP builders accept HTTP routes only. If your full API contract also contains
WebSocket routes, pass a HTTP-only contract slice to `router()` or `routes()`.

```ts
const httpContract = {
	health: apiContract.health,
	todos: apiContract.todos,
} as const;
```

Handlers receive one flattened request object containing fields from `params`,
`query`, `headers`, and `body`. The same object also includes `context`, which
contains the Express request.

```ts
const healthRoutes = router(apiContract.health, {
	get({ context }) {
		const requestId =
			context.req.header("x-request-id") ??
			`${apiContract.health.get.method} ${apiContract.health.get.path}`;
		return {
			status: 200,
			body: { status: "ok", requestId },
		};
	},
});
```

The following intentionally does not compile, because `router()` binds plain
handlers and `route()` returns an already-built implementation:

```ts
router(apiContract.health, {
	get: route(apiContract.health.get, () => ({
		status: 200,
		body: { status: "ok" },
	})),
});
```

Use `routes()` for that composition style instead.

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

The `status` must be one of the route declaration's `responses` keys. Non-2xx
responses are normal typed responses:

```ts
const createTodoRoute = route(apiContract.todos.create, ({ title }) => {
	if (todoExists(title)) {
		return {
			status: 409,
			body: { code: "TITLE_ALREADY_EXISTS" },
		};
	}

	return {
		status: 201,
		body: createTodo(title),
	};
});
```

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

When a route declaration declares exactly one successful status, the handler may
return that successful body directly.

### With Custom Headers

You can also return custom headers in the response envelope. The headers will be
set on the Express response before sending the body. The header value comes from
nodes `OutgoingHttpHeader` type.

```ts
return {
	status: 200,
	body: {
		items,
	},
	headers: {
		"x-total-count": items.length
	},
};
```

## Request Flow

For each HTTP route declaration:

1. request validation runs first
2. the service handler runs last

Handlers receive one flattened request object containing fields from `params`,
`query`, `headers`, and `body`.

## Helper Types

Inline handlers usually get their types from inference. When handlers move into
separate files, use the route helper types to keep request, response, and
WebSocket message types.

```ts
import type {
	InferRouteServerReceivedMessage,
	InferRouteServerSendMessage,
	InferRouteServerSocket,
	RouteHandler,
	InferRouteHandlerRequest,
	InferRouteHandlerResponse,
} from "@contract-first-api/express";
import { apiContract } from "@example/shared";

type CreateTodoHandler = RouteHandler<
	typeof apiContract.todos.create
>;

export const createTodo: CreateTodoHandler = async ({ title }) => {
	const todo = await createTodoRecord({ title });

	return {
		status: 201,
		body: todo,
	};
};

type InspectImageRequest = InferRouteHandlerRequest<
	typeof apiContract.images.inspect
>;

type TodoListResponse = InferRouteHandlerResponse<
	typeof apiContract.todos.list
>;

type DiscussSocket = InferRouteServerSocket<typeof apiContract.discuss.connect>;
type IncomingDiscussMessage = InferRouteServerReceivedMessage<
	typeof apiContract.discuss.connect
>;
type OutgoingDiscussMessage = InferRouteServerSendMessage<
	typeof apiContract.discuss.connect
>;
```

## Custom Body Handling

If the contract contains both default JSON bodies and custom bodies, use
`matchRoute()` to determine which body parser to use for each request.

```ts
import { isCustomBody, matchRoute } from "@contract-first-api/express";

const jsonBodyParser = express.json();

app.use((req, res, next) => {
	const matched = matchRoute(apiContract, req);
	const body = matched?.request?.body;
	const bodyParser = isCustomBody(body)
		? getCustomBodyParser(body.contentType)
		: jsonBodyParser;

	return bodyParser(req, res, next);
});
```

Custom body service handlers receive the parsed request body as `body` in
addition to typed params and query fields.

## Streaming Responses

Streaming responses are declared with `streamBody(schema)` in the route declaration.
Service handlers can return the async iterable directly when the route
declaration has one successful status.

```ts
const routes = router(apiContract.todos, {
	events() {
		return readTodoEvents();
	},
});
```

The route writes each yielded value as NDJSON with
`content-type: application/x-ndjson`.

## WebSocket Routes

Use the explicit WebSocket helpers and register them on the underlying HTTP
server:

```ts
import {
	registerWebSocketRoutes,
	webSocketRoute,
	webSocketRoutes,
} from "@contract-first-api/express";
import { apiContract } from "@example/shared";
import express from "express";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);

const socketContract = {
	discuss: apiContract.discuss,
} as const;

const socketRoutes = webSocketRoutes(socketContract, {
	discuss: {
		connect: webSocketRoute(apiContract.discuss.connect, ({ context }) => {
			context.socket.send({
				type: "history",
				messages: [],
			});

			context.socket.onMessage((message) => {
				context.socket.send({
					type: "message",
					text: message.text,
				});
			});
		}),
	},
});

registerWebSocketRoutes(server, socketRoutes);
```

Incoming WebSocket messages are delivered to `onMessage` only after they parse
as JSON and match the declared incoming message schema. Invalid incoming
messages close the connection. Messages sent from the server are validated and
transformed before they are written to the socket.

## How It Connects

- Define `apiContract` with `@contract-first-api/core`.
- Import the same contract into your backend.
- Register HTTP implementations with `route()`, `router()`, `routes()`, and
  `registerRoutes()`.
- Register WebSocket implementations with `webSocketRoute()`,
  `webSocketRouter()`, `webSocketRoutes()`, and `registerWebSocketRoutes()`.
- Use `initClient()` from `@contract-first-api/core` on the frontend with the
  same API contract and a deployment `baseUrl`.

This package stays on the server side. The core client, React Query adapter, and
core OpenAPI generator are optional consumers of the same contract.
