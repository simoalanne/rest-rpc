# @contract-first-api/express

Use this reference for backend integration with Express.

## Purpose

`@contract-first-api/express` mounts a shared contract tree on an Express app
with request validation, typed service handlers, middleware hooks, streaming
support, and websocket routes.

## Main Setup

Use `initServer()` to get helpers, then:

1. register body parsing middleware
2. define middleware with `defineMiddleware()` when typed contract metadata is
   needed
3. define handlers with `defineService()`
4. register routes with `createRouter()`
5. use `throwKnownError()` for known error shapes declared in the contract tree

```ts
const { createRouter, defineMiddleware, defineService, throwKnownError } = initServer<
	typeof contracts,
	RequestContext
>();
```

Minimal setup:

```ts
const app = express();
app.use(express.json());

createRouter({
	app,
	contracts,
	services,
	routePrefix: "/api",
});
```

Typed service example:

```ts
const services = {
	todos: defineService("todos", {
		async list() {
			return await getTodos();
		},
		async create({ title, context }) {
			return await createTodo({
				title,
				ownerId: context.userId,
			});
		},
	}),
};
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

This depends on request field names being unique across locations in the
contract.

```ts
const services = {
	todos: defineService("todos", {
		async get({ id, includeCompleted, context }) {
			return await loadTodo({
				id,
				includeCompleted,
				userId: context.userId,
			});
		},
	}),
};
```

## Raw Body Handling

If the contract tree mixes raw and non-raw routes, prefer
`createContractModeMiddleware()` so parsing is chosen from the contract tree
rather than hardcoded route paths.

Use raw mode when the request body should pass through unvalidated while
keeping typed params, query, response, and known errors.

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

## Throwing Known Errors

Use `throwKnownError()` when the contract defines a known error and you want
type-safe error handling.

```ts
if (!someResource) {
	// Return the call so TypeScript narrows control flow correctly.
	return throwKnownError({
		code: "SOME_KNOWN_ERROR",
		someCustomField: "value",
	});
}

doSomething(someResource);
```

Middleware using typed metadata:

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

Websocket service example:

```ts
const services = {
	chat: defineService("chat", {
		connect({ socket }) {
			socket.onMessage((message) => {
				socket.send({
					text: `echo: ${message.text}`,
				});
			});
		},
	}),
};
```

## Important Rules

- Register JSON parsing before `createRouter()` when routes use JSON bodies.
- Keep `routePrefix` aligned with the client `baseUrl`.
- Use `defineMiddleware()` when middleware logic depends on typed contract
  metadata like `meta.requiresAuth`.
- For contracts without a `response` schema, handlers should return nothing and
  the route responds with `204`.
- Websocket contracts use typed socket handling instead of returning a normal
  response body.

## Use This Package When

- mounting contracts on an Express app
- adding middleware that depends on contract metadata
- implementing raw body, stream, or websocket routes
- debugging validation order or service input shape
