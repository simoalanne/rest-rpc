import {
	type ClientFetchResponse,
	type ClientRequestInput,
	customBody,
	initClient,
	jsonQuery,
	noBody,
	router,
	type as schemaType,
	stream,
	webSocketMessages,
} from "@rest-rpc/core";
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
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: todoSchema,
				404: errorSchema,
			},
		},
		search: {
			method: "GET",
			path: "/todos/search",
			query: z.object({
				includeDone: z.boolean().optional(),
				page: z.number(),
				search: z.string(),
			}),
			responses: {
				200: z.array(todoSchema),
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
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: stream(todoSchema),
				202: todoSchema,
				204: noBody(),
			},
		},
		exportCsv: {
			method: "GET",
			path: "/todos.csv",
			responses: {
				200: customBody({
					contentType: "text/csv",
					schema: z.string(),
				}),
			},
		},
		exportCsvStream: {
			method: "GET",
			path: "/todos-stream.csv",
			responses: {
				200: stream(
					customBody({
						contentType: "text/csv",
						schema: z.string(),
					}),
				),
			},
		},
		socket: {
			method: "GET",
			path: "/todos/socket",
			mode: "webSocket",
			messages: {
				client: webSocketMessages("action", {
					echo: z.object({ text: z.string() }),
					count: z.object({
						value: z.string().transform((value) => Number(value)),
					}),
				}),
				server: {
					discriminator: "type",
					schemas: {
						ready: z.object({
							createdAt: z
								.string()
								.datetime()
								.transform((value) => new Date(value)),
						}),
						event: z.string(),
					},
				},
			},
		},
	},
});

const client = initClient(api, {
	origin: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	client.todos.list.fetch(),
);
expectType<Promise<{ total: number }>>(client.todos.stats.fetch());
expectType<Promise<{ id: string; title: string }>>(
	client.todos.get.fetch({ id: "todo-1" }),
);
expectType<Promise<Array<{ id: string; title: string }>>>(
	client.todos.search.fetch({
		includeDone: false,
		page: 1,
		search: "milk",
	}),
);
expectType<Promise<Array<{ id: string; title: string }>>>(
	client.todos.jsonSearch.fetch({
		query: {
			page: "1",
			filters: { tags: ["api"] },
		},
	}),
);
expectError(client.todos.jsonSearch.fetch({ page: "1" }));
expectError(client.todos.jsonSearch.fetch());
expectType<Promise<Array<{ id: string; title: string }>>>(
	client.todos.optionalJsonSearch.fetch({ query: undefined }),
);
expectError(client.todos.optionalJsonSearch.fetch({}));
expectError(client.todos.optionalJsonSearch.fetch());
expectType<Promise<{ id: string; title: string }>>(
	client.todos.create.fetch({ title: "Write type tests" }),
);
expectType<Promise<{ id: string }>>(
	client.todos.transform.fetch({ id: "1", title: "Write type tests" }),
);
expectError(client.todos.transform.fetch({ id: 1, title: "wrong id input" }));
expectError(
	client.todos.transform.fetch({
		id: "1",
		title: "Write type tests",
		slug: "server-output-only",
	}),
);
expectType<Promise<ClientFetchResponse<typeof api.todos.events>>>(
	client.todos.events.fetchResponse(),
);
expectError(client.todos.events.fetch());
expectType<Promise<Response>>(client.todos.exportCsv.fetch());
expectType<Promise<Response>>(client.todos.exportCsvStream.fetch());

// Routes with request input require that flattened input object.
expectError(client.todos.get.fetch());
expectError(client.todos.get.fetch({ title: "wrong segment" }));
// Routes without request input treat the first argument as fetch options.
expectError(client.todos.list.fetch({ id: "todo-1" }));

type CreateTodoInput = ClientRequestInput<typeof api.todos.create>;
expectType<{ title: string }>(null as unknown as CreateTodoInput);

const socket = client.todos.socket.openConnection();
socket.send({ action: "echo", message: { text: "hello" } });
socket.send({ action: "count", message: { value: "1" } });
expectError(socket.send({ action: "count", message: { value: 1 } }));
expectError(socket.send({ action: "missing", message: {} }));

socket.onMessage((message) => {
	if (message.type === "ready") {
		expectType<Date>(message.message.createdAt);
	} else {
		expectType<"event">(message.type);
		expectType<string>(message.message);
	}
});
