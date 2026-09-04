import { route as coreRoute } from "@rest-rpc/core";
import { type as schemaType } from "@rest-rpc/core/standard-schema";
import {
	createRouteHandler,
	route,
	router,
	type FetchRouteHandlerResult,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/fetch";
import { expectError, expectType } from "tsd";

const todoSchema = schemaType<{ id: string }>();

const api = {
	todos: {
		get: coreRoute
			.get("/todos/:id")
			.params(schemaType<{ id: string }>())
			.response(200, todoSchema),
	},
	health: coreRoute.get("/health").response(204),
} as const;

type Runtime = {
	env: {
		authToken: string;
	};
};

declare module "@rest-rpc/fetch" {
	interface DefaultRuntimeContext extends Runtime {}
}

// should infer runtime context and accumulated middleware context for router handlers
const routes = router(api)
	.middleware(({ request, route, runtime }) => {
		expectType<Request>(request);
		expectType<ServerHttpRouteDeclaration>(route);
		expectType<string>(runtime.env.authToken);
		expectError(runtime.unknownKey);

		if (request.headers.get("authorization") !== runtime.env.authToken) {
			return new Response(null, { status: 401 });
		}

		return {
			userId: "user-1",
		};
	})
	.middleware(({ context, runtime }) => {
		expectType<string>(context.userId);
		expectType<string>(runtime.env.authToken);

		return {
			authToken: runtime.env.authToken,
		};
	})
	.handlers({
		todos: {
			get: ({ id, context }) => {
				expectType<string>(id);
				expectType<string>(context.userId);
				expectType<string>(context.authToken);

				return { id };
			},
		},
		health: () => undefined,
	});

const handle = createRouteHandler(routes);
expectType<Promise<FetchRouteHandlerResult>>(
	handle(new Request("https://example.com/todos/todo-1"), {
		env: { authToken: "secret" },
	}),
);
expectError(handle(new Request("https://example.com/todos/todo-1")));

// should expose the Request object without middleware context when no middleware is used
const publicRoutes = router(api).handlers({
	todos: {
		get: ({ id, context }) => {
			expectType<Request>(context.request);
			expectType<AbortSignal>(context.request.signal);
			expectError(context.userId);

			return { id };
		},
	},
	health: () => undefined,
});

const publicHandle = createRouteHandler<Record<never, never>>(publicRoutes);
expectType<Promise<FetchRouteHandlerResult>>(
	publicHandle(new Request("https://example.com")),
);
expectType<Promise<FetchRouteHandlerResult>>(
	publicHandle(new Request("https://example.com"), {}),
);

// should infer accumulated middleware context for single route handlers
const getTodoRoute = route(api.todos.get)
	.middleware(({ runtime }) => ({
		authToken: runtime.env.authToken,
	}))
	.middleware(({ context }) => {
		expectType<string>(context.authToken);

		return {
			userId: "user-1",
		};
	})
	.handler(({ id, context }) => {
		expectType<string>(context.authToken);
		expectType<string>(context.userId);

		return { id };
	});

createRouteHandler(getTodoRoute);

// should replace overlapping middleware context keys with the last returned type
route(api.todos.get)
	.middleware(() => ({
		value: "first" as const,
	}))
	.middleware(({ context }) => {
		expectType<"first">(context.value);

		return {
			value: "second" as const,
		};
	})
	.handler(({ id, context }) => {
		expectError<"first">(context.value);
		expectType<"second">(context.value);

		return { id };
	});

// should accept compiled routes without applying parent middleware context to them
const compiledGetTodoRoute = route(api.todos.get)
	.middleware(() => ({
		routeContext: "route",
	}))
	.handler(({ id, context }) => {
		expectType<string>(context.routeContext);
		expectError(context.authToken);

		return { id };
	});

router(api)
	.middleware(({ runtime }) => ({
		authToken: runtime.env.authToken,
	}))
	.handlers({
		todos: {
			get: compiledGetTodoRoute,
		},
		health: ({ context }) => {
			expectType<string>(context.authToken);
			return undefined;
		},
	});

// should accept compiled router subtrees without applying parent middleware context to them
const compiledTodoRoutes = router(api.todos)
	.middleware(() => ({
		routerContext: "router",
	}))
	.handlers({
		get: ({ id, context }) => {
			expectType<string>(context.routerContext);
			expectError(context.authToken);

			return { id };
		},
	});

router(api)
	.middleware(({ runtime }) => ({
		authToken: runtime.env.authToken,
	}))
	.handlers({
		todos: compiledTodoRoutes,
		health: ({ context }) => {
			expectType<string>(context.authToken);
			return undefined;
		},
	});

// should reject router and route shorthand overloads
expectError(router(api, {}));
expectError(route(api.todos.get, () => ({ id: "todo-1" })));
