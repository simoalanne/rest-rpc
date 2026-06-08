# @contract-first-api/express

Mount a shared contract tree on an Express app with request validation, typed
service handlers, middleware hooks, typed request context, streaming responses,
and websocket routes.

This package is the backend integration for `contract-first-api`. It consumes
contracts from `@contract-first-api/core`; it does not define contracts itself
and it does not require the API client packages.

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

Start by calling `initServer()` to get the helper functions. Add middlewares with `defineMiddleware()`, define your service handlers with `defineService()`, then call `createRouter()` to register routes for every contract implementation.

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
			// .validatedRequest // Also added by the library automatically.
			userId?: string;
		}
	}
}

const authMiddleware = defineMiddleware((req, res, next) => {
	// if you use the defineMiddleware helper .meta is typed correctly, otherwise it's unknown type.
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

## Services

The `services` object must match the contract tree. Each leaf is a service created with `defineService()`. The first argument is the contract subtree key, and the second is an object of service handlers.

```ts
const services = {
	todos: defineService("todos", {
		get({ id, includeCompleted, context }) {
			return {
				id,
				title: "Try contract-first-api",
				includeCompleted,
				viewerId: context.userId,
			};
		},
	}),
};
```

Service handlers receive one object:

- validated request fields from `body`, `query`, and `params`
- `context` returned by `createContext`

Handler return types are inferred from the contract response schema. If a
contract does not define `response`, the handler should return nothing and the route responds with `204`.

For websocket contracts, the service handler receives a typed `socket` instead
of returning a response body.

## Request Validation

For each registered route, Express receives a validation middleware before your
custom middlewares and service handler.

The validation middleware:

- attaches the current contract to `req.contract`
- validates `req.body`, `req.query`, and `req.params`
- merges validated values into `req.validatedRequest`
- returns `400` JSON when validation fails

If validation fails, custom middlewares, `createContext`, and the service handler DO NOT run. you can be sure that if a service handler or your custom middleware runs, the request is valid according to the contract.

## Middleware

Use `defineMiddleware()` when middleware needs typed contract metadata.

```ts
const authMiddleware = defineMiddleware((req, res, next) => {
	if (!req.contract.meta?.requiresAuth) {
		next();
		return;
	}

	const token = req.get("authorization");
	if (!token) {
		res.sendStatus(401);
		return;
	}

	req.userId = "user_123";
	next();
});
```

Custom middlewares run after request validation and before `createContext`.
That means middleware can read `req.contract`, inspect validated request data,
and attach values to the Express request for `createContext` to use.

For middleware declared outside `defineMiddleware()`, the package exports
`RequestWithContract`:

```ts
import type { RequestWithContract } from "@contract-first-api/express";
import type { NextFunction, Response } from "express";

type ContractMeta = {
	requiresAuth?: boolean;
};

const authMiddleware = (
	req: RequestWithContract<ContractMeta>,
	res: Response,
	next: NextFunction,
) => {
	if (!req.contract.meta?.requiresAuth) {
		next();
		return;
	}

	res.sendStatus(401);
};
```

## Context

Use `createContext` to build the typed `context` value passed to every service
handler.

```ts
type RequestContext = {
	userId?: string;
	requestId: string;
};

const { createRouter, defineService } = initServer<
	typeof contracts,
	RequestContext
>();

createRouter({
	app,
	contracts,
	services,
	createContext: (req) => ({
		userId: req.userId,
		requestId: crypto.randomUUID(),
	}),
});
```

`createContext` runs after validation and custom middlewares. It can read
`req.contract`, `req.validatedRequest`, and anything earlier Express middleware
attached to the request.

## Known Errors

If a contract defines known errors, `throwKnownError()` only accepts errors from
that contract tree.

```ts
const { createRouter, defineService, throwKnownError } =
	initServer<typeof contracts>();

const services = {
	todos: defineService("todos", {
		create({ title }) {
			if (title === "Already exists") {
				throwKnownError({
					code: "TITLE_ALREADY_EXISTS",
					status: 409,
				});
			}

			return {
				id: crypto.randomUUID(),
				title,
			};
		},
	}),
};
```

Known errors are returned as JSON. If the error payload has a numeric `status`,
that status code is used. Otherwise the route responds with `400`.

Unexpected service errors are not swallowed; they continue to Express global error handler.

## Streaming Responses

For contracts with `options: { mode: "stream" }`, service handlers must return an
async iterable. The route writes each yielded value as an NDJSON chunk.

```ts
const services = {
	todos: defineService("todos", {
		async *events() {
			yield {
				type: "created",
				id: "todo_1",
				title: "Try streams",
			};
		},
	}),
};
```

Streaming responses use `content-type: application/x-ndjson`.

## WebSocket Routes

For contracts with `options: { mode: "websocket" }`, `createRouter()` registers
an upgrade handler on the provided HTTP server. Express still handles normal
HTTP routes, but websocket upgrades happen on the underlying Node server, so
the `server` option is required when websocket contracts are present.

```ts
import { initServer } from "@contract-first-api/express";
import { contracts } from "@example/shared";
import express from "express";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);

const { createRouter, defineService } = initServer<typeof contracts>();

const services = {
	discuss: defineService("discuss", {
		room({ socket }) {
			socket.send({
				type: "history",
				messages: [],
			});

			socket.onMessage((result) => {
				if (!result.success) {
					return;
				}

				socket.send({
					type: "message",
					text: result.data.text,
				});
			});

			socket.onClose(() => {
				// clean up app-level connection state here
			});
		},
	}),
};

createRouter({
	app,
	server,
	contracts,
	services,
	routePrefix: "/api",
});

server.listen(3001);
```

The websocket service socket is an augmented `ws` socket:

- `send(message)`: send a JSON message matching `messages.server`
- `onMessage(callback)`: receive parsed `messages.client` results
- `onClose(callback)`: subscribe to close events and return an unsubscribe
  function

Invalid incoming websocket messages call `onMessage` with `{ success: false }`.
The library does not decide what that means for your application.

WebSocket request validation happens before the upgrade. Since the upgrade
request has no JSON body, websocket routes validate `query` and `params`
schemas. If validation or context creation fails before the upgrade, the server
responds with an HTTP error instead of opening the websocket.

## Route Registration

`createRouter()` registers one Express route for every JSON and stream contract
leaf. WebSocket contracts are registered on the underlying HTTP server's
upgrade event.

```ts
createRouter({
	app,
	contracts,
	services,
	routePrefix: "/api",
});
```

The registered path is `routePrefix + contract.path`. Static routes are ordered
before parameter routes when paths overlap.

Success status codes are:

- `201` for `POST`
- `204` for contracts without a `response` schema
- `200` for other successful responses

## How It Connects

- Define contracts with `@contract-first-api/core`.
- Import the same contracts into your backend.
- Register them with `initServer()` and `createRouter()`.
- Use `@contract-first-api/api-client` on the frontend with the same contract
  tree and matching `baseUrl`.

This package stays on the server side. The API client and React Query packages
are optional consumers of the same contracts.
