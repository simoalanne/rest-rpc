import { router as defineRouter, noBody } from "@rest-rpc/core/contract";
import { type as schemaType } from "@rest-rpc/core/standard-schema";
import {
	createRouteHandler,
	type NextRouteMiddleware,
	type RouteRequest,
	route,
	router,
} from "@rest-rpc/next";
import { type NextRequest, NextResponse } from "next/server.js";
import { expectAssignable, expectType } from "tsd";

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

const middleware: NextRouteMiddleware<{ userId: string }> = ({ request }) => {
	expectType<string>(request.nextUrl.pathname);
	expectType<string | undefined>(request.cookies.get("session")?.value);

	return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
};

const routes = router(api)
	.middleware(middleware)
	.handlers({
		todos: {
			get: ({ id, context }) => {
				expectType<string>(id);
				expectType<string>(context.userId);
				expectType<string>(context.request.nextUrl.pathname);
				expectType<string | undefined>(
					context.request.cookies.get("session")?.value,
				);

				return { id };
			},
		},
		health: ({ context }) => {
			expectType<string>(context.request.nextUrl.pathname);
			return undefined;
		},
	});

const getTodoRoute = route(api.todos.get).handler(({ id, context }) => {
	expectType<string>(context.request.nextUrl.pathname);
	expectType<string | undefined>(context.request.cookies.get("session")?.value);

	return { id };
});

createRouteHandler(routes);
createRouteHandler(getTodoRoute);

type GetTodoRequest = RouteRequest<typeof api.todos.get>;
expectAssignable<NextRequest>({} as GetTodoRequest["context"]["request"]);
