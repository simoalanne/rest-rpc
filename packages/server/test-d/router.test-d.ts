import { router as defineRouter } from "@contract-first-api/core/contract";
import {
	type InferRouteHandlerRequest,
	route,
	router,
} from "@contract-first-api/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

type TestRouteHandlerContext = {
	userId: string;
};

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
		transform: {
			method: "POST",
			path: "/todos/:id/transform",
			request: {
				params: z.object({ id: z.string() }).transform(({ id }) => ({
					id: Number(id),
				})),
				body: z.object({ title: z.string() }).transform(({ title }) => ({
					title: title.trim(),
					slug: title.toLowerCase(),
				})),
			},
			responses: {
				200: z.object({ id: z.number() }).transform(({ id }) => ({
					id: String(id),
				})),
			},
		},
	},
});

type CreateTodoRequest = InferRouteHandlerRequest<
	typeof api.todos.create,
	TestRouteHandlerContext
>;
declare const createTodoRequest: CreateTodoRequest;
expectType<string>(createTodoRequest.title);
expectType<TestRouteHandlerContext>(createTodoRequest.context);

const createImplementation = route(api.todos.create, ({ title, context }) => {
	expectType<string>(title);
	expectType<Record<string, unknown>>(context);

	return {
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
	};
});

expectType<typeof api.todos.create>(createImplementation.route);

route(api.todos.transform, ({ id, title, slug }) => {
	expectType<number>(id);
	expectType<string>(title);
	expectType<string>(slug);

	return {
		status: 200 as const,
		body: {
			id: 1,
		},
	};
});

expectError(
	route(api.todos.transform, () => ({
		status: 200 as const,
		body: {
			id: "client-output-shape",
		},
	})),
);

const implementations = router(api, {
	todos: {
		create: ({ title }) => ({
			id: "todo-1",
			title,
		}),
		transform: ({ id }) => ({
			status: 200 as const,
			body: {
				id,
			},
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
