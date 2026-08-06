# @contract-first-api/express

Use this reference for backend integration with Express.

## Purpose

`@contract-first-api/express` mounts a shared contract tree on an Express app
with request validation, typed service handlers, route matching helpers,
streaming support, and websocket routes.

## Main Setup

Use the Express helpers directly:

1. register body parsing middleware
2. bind handlers with `router()` or `route()`
3. register route implementations with `registerRoutes()`

Minimal setup:

```ts
const app = express();
app.use(express.json());

registerRoutes(app, implementations);
```

## Typed Service Responses

HTTP service handlers return declared response envelopes. When a contract has
exactly one successful status, handlers may return the successful body directly.

```ts
const implementations = router(contract.todos, {
	async list() {
		return {
			status: 200,
			body: {
				items: await getTodos(),
			},
		};
	},
	async create({ title, context }) {
		if (await todoExists(title)) {
			return {
				status: 409,
				body: {
					code: "TITLE_ALREADY_EXISTS",
				},
			};
		}

		return {
			status: 201,
			body: await createTodo({
				title,
				ownerId: context.req.user.id,
			}),
		};
	},
});
```

The `status` must be one of the contract's `responses` keys. Non-2xx statuses
are typed response cases.

Handlers can also throw `ContractResponseError` when returning a declared error
response would make service flow awkward:

```ts
throw new ContractResponseError(contract.todos.get, {
	status: 404,
	body: {
		code: "TODO_NOT_FOUND",
	},
});
```

The response must match a non-2xx response declared by that route. Other thrown
errors continue to the Express global error handler.

## Validated Request Shape

Handlers receive one flattened request object:

- fields from `params`
- fields from `query`
- fields from `headers`
- fields from `body`
- `context`

This depends on request field names being unique across locations in the
contract. Core reserves `context` for adapter handler context.

```ts
const implementations = router(contract.todos, {
	async get({ id, includeCompleted, context }) {
		return {
			status: 200,
			body: await loadTodo({
				id,
				includeCompleted,
				userId: context.req.user.id,
			}),
		};
	},
});
```

## Custom Body Handling

If the contract contains both default JSON bodies and custom bodies, use
`matchRoute()` and `isCustomBody()` to determine which body parser to use for
each request. Express still owns parser choice, limits, and middleware order.

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

Use `customBody({ schema, contentType })` when the request body should be
treated as one whole `body` value while keeping typed params, query, context,
and responses. The Express adapter validates the already-parsed `req.body`
against the custom body schema.

## Middleware

Use regular Express middleware for application-specific request handling. When
middleware needs to know which contract route matched, call `matchRoute()`.

```ts
const authMiddleware: express.RequestHandler = (req, res, next) => {
	const matched = matchRoute(contract, req);

	if (matched?.metadata?.auth === "required") {
		const user = getUserFromAuthHeader(req.headers.authorization);
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

## Streaming Responses

Streaming responses are declared with `streamBody(schema)`. Service handlers return
the async iterable body directly when the contract has one successful status.
Each chunk is validated before it is sent, and the validated output value is
written to the response stream.

```ts
const implementations = router(contract.todos, {
	events() {
		return readEvents();
	},
});
```

## WebSocket Services

WebSocket services receive a typed socket instead of returning a response.
Incoming client messages are validated before `onMessage` callbacks receive
them. Messages sent with `context.socket.send()` are validated before they are
written to the socket.

```ts
const implementations = webSocketRouter(contract.chat, {
	connect({ context }) {
		context.socket.onMessage((result) => {
			if (!result.success) return;

			context.socket.send({
				text: `echo: ${result.data.text}`,
			});
		});
	},
});
```

## Important Rules

- Register JSON parsing before `registerRoutes()` when routes use JSON bodies.
- Use `router(..., { pathPrefix: "/api" })` when every route should
  share a common path prefix; common `metadata`, `commonResponses`, and
  `commonHeaders` can be merged the same way.
- Return `{ status, body }` for non-2xx responses and for routes with
  multiple successful statuses.
- Return the body directly when a route has one successful status and the
  status code is clear from the route.
- Declare bodyless responses with `noBody()` and use `body: undefined` when
  returning an explicit `{ status, body }` envelope for them.
- WebSocket routes use typed socket handling instead of returning a normal
  response body.

## Use This Package When

- mounting routes on an Express app
- implementing custom body, stream, or websocket routes
- debugging validation order or service input shape
