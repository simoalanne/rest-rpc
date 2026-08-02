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

```ts
const { createRouter, defineMiddleware, defineService } = initServer<
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

## Typed Service Responses

HTTP service handlers return declared response envelopes. When a contract has
exactly one successful status, handlers may return the successful body directly.

```ts
const services = {
	todos: defineService("todos", {
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
					ownerId: context.userId,
				}),
			};
		},
	}),
};
```

The `status` must be one of the contract's `responses` keys. Non-2xx statuses
are typed response cases.

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
			return {
				status: 200,
				body: await loadTodo({
					id,
					includeCompleted,
					userId: context.userId,
				}),
			};
		},
	}),
};
```

## Raw Body Handling

If the contract tree mixes raw and non-raw routes, prefer
`createContractModeMiddleware()` so parsing is chosen from the contract tree
rather than hardcoded route paths.

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

Use raw mode when the request body should pass through unvalidated while
keeping typed params, query, and responses. Raw service handlers receive a
`rawBody` field.

## Middleware

Use `defineMiddleware()` when middleware logic depends on typed contract
metadata like `meta.requiresAuth`.

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

## Streaming Responses

Streaming responses are declared with `stream(schema)`. Service handlers return
the async iterable body directly when the contract has one successful status.

```ts
const services = {
	todos: defineService("todos", {
		events() {
			return readEvents();
		},
	}),
};
```

## WebSocket Services

WebSocket services receive a typed socket instead of returning a response.

```ts
const services = {
	chat: defineService("chat", {
		connect({ socket }) {
			socket.onMessage((result) => {
				if (!result.success) return;

				socket.send({
					text: `echo: ${result.data.text}`,
				});
			});
		},
	}),
};
```

## Important Rules

- Register JSON parsing before `createRouter()` when routes use JSON bodies.
- Keep `routePrefix` aligned with the client `baseUrl`.
- Return `{ status, body }` for non-2xx responses and for contracts with
  multiple successful statuses.
- Return the body directly when a contract has one successful status and the
  status code is clear from the contract.
- Use `body: undefined` for `noBody` responses.
- WebSocket contracts use typed socket handling instead of returning a normal
  response body.

## Use This Package When

- mounting contracts on an Express app
- adding middleware that depends on contract metadata
- implementing raw body, stream, or websocket routes
- debugging validation order or service input shape
