# @contract-first-api/express

Use this reference for backend integration with Express.

## Purpose

`@contract-first-api/express` mounts a shared contract tree on an Express app
with request validation, typed service handlers, middleware hooks, streaming
support, and websocket routes.

## Main Setup

Use `initServer()` to get helpers, then:

1. register body parsing middleware
2. define handlers with `implementContract()`
3. pass regular Express middlewares to `createRouter()` when they need to run
   after contract request validation
4. register routes with `createRouter()`

```ts
const { createRouter, implementContract } = initServer<
	typeof contract,
	RequestContext
>();
```

Minimal setup:

```ts
const app = express();
app.use(express.json());

createRouter({
	app,
	contract,
	implementations,
	routePrefix: "/api",
});
```

## Typed Service Responses

HTTP service handlers return declared response envelopes. When a contract has
exactly one successful status, handlers may return the successful body directly.

```ts
const implementations = [
	implementContract(contract.todos).handlers({
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
];
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
const implementations = [
	implementContract(contract.todos).handlers({
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
];
```

## Raw Body Handling

If the contract tree mixes raw and non-raw routes, prefer
`createContractModeMiddleware()` so parsing is chosen from the contract tree
rather than hardcoded route paths.

```ts
app.use(
	createContractModeMiddleware({
		contract,
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

Pass regular Express middleware to `createRouter()` when middleware logic needs
the validated request or matched contract route before context creation.

```ts
const authMiddleware: express.RequestHandler = (req, res, next) => {
	if (req.contract.path !== "/todos") {
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

## Streaming Responses

Streaming responses are declared with `stream(schema)`. Service handlers return
the async iterable body directly when the contract has one successful status.

```ts
const implementations = [
	implementContract(contract.todos).handlers({
		events() {
			return readEvents();
		},
	}),
];
```

## WebSocket Services

WebSocket services receive a typed socket instead of returning a response.

```ts
const implementations = [
	implementContract(contract.chat).handlers({
		connect({ socket }) {
			socket.onMessage((result) => {
				if (!result.success) return;

				socket.send({
					text: `echo: ${result.data.text}`,
				});
			});
		},
	}),
];
```

## Important Rules

- Register JSON parsing before `createRouter()` when routes use JSON bodies.
- Keep `routePrefix` aligned with the client `baseUrl`.
- Return `{ status, body }` for non-2xx responses and for routes with
  multiple successful statuses.
- Return the body directly when a route has one successful status and the
  status code is clear from the route.
- Use `body: undefined` for `noBody` responses.
- WebSocket routes use typed socket handling instead of returning a normal
  response body.

## Use This Package When

- mounting routes on an Express app
- implementing raw body, stream, or websocket routes
- debugging validation order or service input shape
