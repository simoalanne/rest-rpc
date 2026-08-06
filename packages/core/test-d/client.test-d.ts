import {
	type InferRouteClientRequestInput,
	initClient,
	router,
	type as schemaType,
} from "@contract-first-api/core";
import { expectError, expectType } from "tsd";
import { z } from "zod";

const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
});

const errorSchema = z.object({
	message: z.string(),
});

const api = router({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: z.array(todoSchema),
			},
		},
		stats: {
			method: "GET",
			path: "/todos/stats",
			responses: {
				200: schemaType<{ total: number }>(),
			},
		},
		get: {
			method: "GET",
			path: "/todos/:id",
			request: {
				params: z.object({ id: z.string() }),
			},
			responses: {
				200: todoSchema,
				404: errorSchema,
			},
		},
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

const client = initClient(api, {
	baseUrl: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	client.todos.list.fetch(),
);
expectType<Promise<{ total: number }>>(client.todos.stats.fetch());
expectType<Promise<{ id: string; title: string }>>(
	client.todos.get.fetch({ id: "todo-1" }),
);
expectType<Promise<{ id: string; title: string }>>(
	client.todos.create.fetch({ title: "Write type tests" }),
);

// Routes with request input require that flattened input object.
expectError(client.todos.get.fetch());
expectError(client.todos.get.fetch({ title: "wrong segment" }));
// Routes without request input treat the first argument as fetch options.
expectError(client.todos.list.fetch({ id: "todo-1" }));

type CreateTodoInput = InferRouteClientRequestInput<typeof api.todos.create>;
expectType<{ title: string }>(null as unknown as CreateTodoInput);
