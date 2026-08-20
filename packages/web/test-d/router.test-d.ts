import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { router as defineRouter, noBody } from "@rest-rpc/core/contract";
import { type as schemaType } from "@rest-rpc/core/standard-schema";
import { createRouteHandler, initWeb, route, router } from "@rest-rpc/web";
import { expectError, expectType } from "tsd";

const todoSchema = schemaType<{ id: string }>();

const api = defineRouter({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			pathParams: {
				id: schemaType<string>(),
			},
			responses: {
				200: todoSchema,
			},
		},
	},
	health: {
		method: "GET",
		path: "/health",
		responses: {
			204: noBody(),
		},
	},
});

type Runtime = {
	env: {
		authToken: string;
	};
};

const web = initWeb<Runtime>();

const routes = web
	.router(api)
	.middleware(({ request, route, runtime }) => {
		expectType<Request>(request);
		expectType<HttpRouteDeclaration>(route);
		expectType<string>(runtime.env.authToken);

		if (request.headers.get("authorization") !== runtime.env.authToken) {
			return new Response(null, { status: 401 });
		}

		return {
			userId: "user-1",
		};
	})
	.handlers({
		todos: {
			get: ({ id, context }) => {
				expectType<string>(id);
				expectType<string>(context.userId);

				return { id };
			},
		},
		health: () => undefined,
	});

const handle = web.createRouteHandler(routes);
expectType<Promise<Response>>(
	handle(new Request("https://example.com/todos/todo-1"), {
		env: { authToken: "secret" },
	}),
);
expectError(handle(new Request("https://example.com/todos/todo-1")));

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

const publicHandle = createRouteHandler(publicRoutes);
expectType<Promise<Response>>(
	publicHandle(new Request("https://example.com"), {}),
);

const getTodoRoute = web
	.route(api.todos.get)
	.middleware(({ runtime }) => ({
		authToken: runtime.env.authToken,
	}))
	.handler(({ id, context }) => {
		expectType<string>(context.authToken);

		return { id };
	});

web.createRouteHandler(getTodoRoute);

const routerWithMiddleware = router(api).middleware(() => ({
	userId: "user-1",
}));
expectError(routerWithMiddleware.middleware(() => ({})));
expectError(router(api, {}));
expectError(route(api.todos.get, () => ({ id: "todo-1" })));
