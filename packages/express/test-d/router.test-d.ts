import { router as defineRouter } from "@contract-first-api/core/contract";
import {
	type HttpRouteHandlerContext,
	type InferRouteHandlerRequest,
	route,
	router,
} from "@contract-first-api/express";
import { expectError, expectType } from "tsd";
import { z } from "zod";

const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
});

const api = defineRouter({
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: z.object({ title: z.string() }),
			},
			responses: {
				201: todoSchema,
			},
		},
	},
});

type CreateTodoRequest = InferRouteHandlerRequest<typeof api.todos.create>;
declare const createTodoRequest: CreateTodoRequest;
expectType<string>(createTodoRequest.title);
expectType<HttpRouteHandlerContext>(createTodoRequest.context);

const createImplementation = route(api.todos.create, ({ title, context }) => {
	expectType<string>(title);
	expectType<HttpRouteHandlerContext>(context);

	return {
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
	};
});

expectType<typeof api.todos.create>(createImplementation.route);

const implementations = router(api, {
	todos: {
		create: ({ title }) => ({
			id: "todo-1",
			title,
		}),
	},
});

expectType<typeof api.todos.create>(implementations.todos.create.route);

// Handler request input is derived from flattened route request segments.
expectError(
	router(api, {
		todos: {
			create: ({ id }) => ({
				id,
				title: "wrong request",
			}),
		},
	}),
);
