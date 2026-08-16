import {
	customBody,
	router as defineRouter,
	jsonQuery,
	noBody,
	stream,
	webSocketMessages,
} from "@rest-rpc/core/contract";
import {
	type InferRouteHandlerRequest,
	type InferWebSocketRouteHandlerRequest,
	route,
	router,
} from "@rest-rpc/server";
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
				201: {
					body: todoSchema,
					headers: {
						location: z.string(),
						"x-next-cursor": z.string().optional(),
					},
				},
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
		uploadImage: {
			method: "POST",
			path: "/todos/:id/image",
			pathParams: z.object({ id: z.string() }),
			body: customBody({
				contentType: ["image/png", "image/jpeg"],
				schema: z.instanceof(Uint8Array),
			}),
			responses: {
				204: noBody(),
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
	socket: {
		room: {
			method: "GET",
			path: "/rooms/:roomId",
			pathParams: z.object({ roomId: z.string() }),
			mode: "webSocket",
			messages: {
				client: {
					discriminator: "action",
					schemas: {
						echo: z.object({ text: z.string() }),
						count: z.object({
							value: z.string().transform((value) => Number(value)),
						}),
					},
				},
				server: webSocketMessages("type", {
					ready: z.object({ roomId: z.string() }),
					counted: z.object({
						value: z.string().transform((value) => Number(value)),
					}),
				}),
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
		responseHeaders: {
			location: "/todos/todo-1",
		},
	};
});

expectType<typeof api.todos.create>(createImplementation.route);

type SocketRequest = InferWebSocketRouteHandlerRequest<
	typeof api.socket.room,
	TestRouteHandlerContext
>;
declare const socketRequest: SocketRequest;
expectType<string>(socketRequest.roomId);
expectType<string>(socketRequest.context.userId);
socketRequest.context.socket.send({
	type: "ready",
	message: { roomId: "room-1" },
});

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

route(api.todos.uploadImage, ({ id, body }) => {
	expectType<string>(id);
	expectType<"image/png" | "image/jpeg">(body.contentType);
	expectType<Uint8Array<ArrayBuffer>>(body.payload);

	return undefined;
});

route(api.socket.room, ({ roomId, context }) => {
	expectType<string>(roomId);

	context.socket.send({ type: "ready", message: { roomId } });
	context.socket.send({ type: "counted", message: { value: "1" } });
	expectError(context.socket.send({ type: "counted", message: { value: 1 } }));
	expectError(context.socket.send({ type: "missing", message: {} }));

	context.socket.onMessage((message) => {
		if (message.action === "echo") {
			expectType<string>(message.message.text);
		} else {
			expectType<"count">(message.action);
			expectType<number>(message.message.value);
		}
	});
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
			status: 201 as const,
			body: {
				id: "todo-1",
				title,
			},
			responseHeaders: {
				location: "/todos/todo-1",
				"x-next-cursor": undefined,
			},
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
		uploadImage: () => undefined,
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
	socket: {
		room: ({ context }) => {
			context.socket.send({
				type: "ready",
				message: { roomId: "room-1" },
			});
		},
	},
});

expectType<typeof api.todos.create>(implementations.todos.create.route);

expectError(
	route(api.todos.create, ({ title }) => ({
		id: "todo-1",
		title,
	})),
);

expectError(
	route(api.todos.create, ({ title }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {},
	})),
);

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
