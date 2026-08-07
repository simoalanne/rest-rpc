# Temporary Note: WebSocket Adapter Decision

## Decision

WebSocket support should use the same contract tree, implementation tree, and
route builder API as HTTP routes. Adapters should expose one `registerRoutes()`
entry point that registers both HTTP and WebSocket implementations.

`@contract-first-api/server` should own route preparation, validation, typed
handler execution, path matching primitives, and WebSocket message handling.
Framework adapters should own their mounting loop, framework request extraction,
framework context exposure, upgrade rejection output, and raw socket adaptation.

## Route API

Use shared builders for both HTTP and WebSocket implementations:

```ts
const implementations = router(apiContract, {
	todos: {
		list: () => [{ id: "todo-1" }],
	},
	rooms: {
		connect: ({ roomId, context }) => {
			context.socket.send({ type: "ready" });

			context.socket.onMessage((message) => {
				context.socket.send({ type: "echo", message });
			});
		},
	},
});
```

WebSocket route declarations keep the existing socket-session shape:

```ts
const connect = {
	method: "GET",
	path: "/rooms/:roomId",
	options: { mode: "websocket" },
	metadata: {
		auth: "required",
	},
	request: {
		params: roomParams,
		query: roomQuery,
		headers: authHeaders,
	},
	messages: {
		client: clientMessage,
		server: serverMessage,
	},
} as const;
```

Dedicated WebSocket route builders are removed. `route()`, `router()`, and
`routes()` handle both HTTP and WebSocket routes.

## Server Package

`@contract-first-api/server` owns:

- mixed HTTP/WebSocket implementation tree typing
- flattening implementation trees
- splitting implementations into HTTP and WebSocket groups
- sorting route implementations by route specificity
- path matcher creation
- matching requests against created path matchers
- reusable route matcher creation for middleware/global matching
- WebSocket route preparation for adapters
- validating WebSocket upgrade request params/query/headers
- running WebSocket route handlers with validated request data
- typed contract socket wrapper
- JSON parse/stringify for WebSocket messages
- client/server message validation
- safe `send`, `onMessage`, `onClose`, and `close` behavior
- closing invalid incoming messages with `1007`
- closing failed message handlers or failed route handlers with `1011`

Path matching should separate matcher construction from matcher execution:

```ts
const matchPath = createPathMatcher("/rooms/:roomId");
const params = matchPath("/rooms/general");

const routeMatchers = createRouteMatchers(implementations);
const match = matchRoute(routeMatchers, {
	method: "GET",
	path: "/rooms/general",
});
```

`matchRoute()` accepts already-created matchers. Code that matches repeatedly
should create matchers once and reuse them.

## Adapter Responsibilities

Adapters own:

- framework/runtime-specific route mounting
- framework request segment extraction
- framework context exposure
- raw socket adaptation into the shared socket interface
- translating upgrade rejections into framework/runtime responses

HTTP route mounting remains a per-route loop:

```ts
for (const route of httpRoutes) {
	app[method](route.path, frameworkHttpCallback);
}
```

WebSocket mounting depends on the adapter:

```ts
// Hono-like runtimes register WebSocket routes through the router.
for (const route of webSocketRoutes) {
	app.get(route.path, upgradeWebSocket(frameworkWebSocketCallback));
}

// Express/ws handles one global Node upgrade event and matches paths itself.
server.on("upgrade", frameworkUpgradeCallback);
```

## Express Adapter

Express owns Node `http.Server` `"upgrade"` handling and `ws` integration.
`express` and `ws` remain peer dependencies of the adapter.

Express registration:

```ts
registerRoutes(app, implementations, {
	webSocket: expressWebSocket(server, {
		beforeUpgrade: async ({ req, route, request }) => {
			if (route.metadata?.auth !== "required") return;

			const user = await authenticate(req);

			if (!user) {
				return {
					status: 401,
					body: { message: "Unauthorized" },
				};
			}

			(req as AuthenticatedUpgradeRequest).user = user;
		},
	}),
});
```

Express `beforeUpgrade` does not receive the raw upgrade `socket` or `head`.
Users return rejection intent and the adapter writes the raw HTTP upgrade
failure.

Express WebSocket handler context:

```ts
type ExpressWebSocketRouteHandlerContext = {
	req: IncomingMessage;
	socket: ContractWebSocket<ServerMessage, ClientMessage>;
};
```

Per-connection state from `beforeUpgrade` can be attached to the
`IncomingMessage` and read from `context.req` in the route handler.

## Hono Adapter

Hono registers WebSocket routes through Hono routing with a caller-provided
`upgradeWebSocket`, because the correct helper is runtime-specific.

Hono registration:

```ts
registerRoutes(app, implementations, {
	webSocket: honoWebSocket(upgradeWebSocket, {
		beforeUpgrade: ({ c, route }) => {
			if (route.metadata?.auth !== "required") return;

			const user = c.get("user");

			if (!user) {
				return c.json({ message: "Unauthorized" }, 401);
			}
		},
	}),
});
```

Hono WebSocket hooks and handlers receive `c` as framework context. Route
handlers should return contract handler results. `beforeUpgrade` should return a
rejection value or `Response` to reject the upgrade.

## Before Upgrade Hook

`beforeUpgrade` is a gate hook.

```ts
type UpgradeRejection = {
	status: number;
	headers?: Record<string, string | number | readonly string[] | undefined>;
	body?: unknown;
};

type BeforeUpgradeResult =
	| void
	| true
	| false
	| UpgradeRejection
	| Response;
```

Semantics:

- `undefined` or `true`: continue the upgrade
- `false`: reject with a default `403`
- `UpgradeRejection`: reject with the provided status/body/headers
- `Response`: reject with that response where the adapter/runtime supports it

## Socket API

Expose a small stable socket abstraction to route handlers:

```ts
type ContractWebSocket<Send, Receive> = {
	send(message: Send): void;
	onMessage(callback: (message: Receive) => void | Promise<void>): () => void;
	onClose(callback: (event: CloseEventLike) => void | Promise<void>): () => void;
	close(code?: number, reason?: string): void;
};

type CloseEventLike = {
	code: number;
	reason?: string;
};
```

WebSocket support remains scoped to typed JSON messages over raw WebSocket
connections.
