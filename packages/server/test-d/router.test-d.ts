import {
	customBody,
	router as defineRouter,
	jsonQuery,
	stream,
} from "@rest-rpc/core/contract";
import { type InferRouteHandlerRequest, route, router } from "@rest-rpc/server";
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
			body: z.object({ title: z.string() }),
			responses: {
				201: todoSchema,
			},
		},
		transform: {
			method: "POST",
			path: "/todos/:id/transform",
			pathParams: z.object({ id: z.string() }).transform(({ id }) => ({
				id: Number(id),
			})),
			body: z.object({ title: z.string() }).transform(({ title }) => ({
				title: title.trim(),
				slug: title.toLowerCase(),
			})),
			responses: {
				200: z.object({ id: z.number() }).transform(({ id }) => ({
					id: String(id),
				})),
			},
		},
		jsonSearch: {
			method: "GET",
			path: "/todos/json-search",
			query: jsonQuery(
				z.object({
					page: z.string().transform((value) => Number(value)),
					filters: z.object({ tags: z.array(z.string()) }),
				}),
			),
			responses: {
				200: z.array(todoSchema),
			},
		},
		optionalJsonSearch: {
			method: "GET",
			path: "/todos/optional-json-search",
			query: jsonQuery(z.object({ page: z.number() }).optional()),
			responses: {
				200: z.array(todoSchema),
			},
		},
	},
	reports: {
		csv: {
			method: "GET",
			path: "/reports.csv",
			responses: {
				200: customBody({
					contentType: "text/csv",
					schema: z.string(),
				}),
			},
		},
		csvStream: {
			method: "GET",
			path: "/reports-stream.csv",
			responses: {
				200: stream(
					customBody({
						contentType: "text/csv",
						schema: z.string(),
					}),
				),
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

route(api.todos.jsonSearch, ({ query }) => {
	expectType<number>(query.page);
	expectType<string[]>(query.filters.tags);

	return [];
});

route(api.todos.optionalJsonSearch, ({ query }) => {
	expectType<{ page: number } | undefined>(query);
	if (query) {
		expectType<number>(query.page);
	}

	return [];
});

expectError(
	route(api.todos.transform, () => ({
		status: 200 as const,
		body: {
			id: "client-output-shape",
		},
	})),
);

route(api.reports.csv, () => ({
	status: 200 as const,
	body: "id,title\n1,First\n",
}));

async function* csvRows() {
	yield "id,title\n";
	yield "1,First\n";
}

route(api.reports.csvStream, () => ({
	status: 200 as const,
	body: csvRows(),
}));

expectError(
	route(api.reports.csvStream, () => ({
		status: 200 as const,
		body: "id,title\n1,First\n",
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
		jsonSearch: ({ query }) => {
			expectType<number>(query.page);
			expectType<string[]>(query.filters.tags);

			return [];
		},
		optionalJsonSearch: ({ query }) => {
			expectType<{ page: number } | undefined>(query);

			return [];
		},
	},
	reports: {
		csv: () => ({
			status: 200 as const,
			body: "id,title\n1,First\n",
		}),
		csvStream: () => ({
			status: 200 as const,
			body: csvRows(),
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
