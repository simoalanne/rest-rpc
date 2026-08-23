import {
	customBody,
	router as defineRouter,
	jsonQuery,
	noBody,
	stream,
	webSocketMessages,
} from "@rest-rpc/core/contract";
import {
	type RouteHandlers,
	type RouteReceived,
	type RouteRequest,
	type RouteRequestData,
	type RouteResponse,
	type RouteSent,
	type RouteSocket,
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

// route handler request inference

// should expose flattened request fields and adapter context to route handlers
const createApi = defineRouter({
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
	},
});

type CreateTodoRequest = RouteRequest<
	typeof createApi.todos.create,
	TestRouteHandlerContext
>;
declare const createTodoRequest: CreateTodoRequest;
expectType<string>(createTodoRequest.title);
expectType<TestRouteHandlerContext>(createTodoRequest.context);

type CreateTodoRequestData = RouteRequestData<typeof createApi.todos.create>;
declare const createTodoRequestData: CreateTodoRequestData;
expectType<string>(createTodoRequestData.title);

type CreateTodoResponse = RouteResponse<typeof createApi.todos.create>;
declare const createTodoResponse: CreateTodoResponse;
expectType<201>(createTodoResponse.status);

// should infer route handler parameters and declared success response envelopes
const createImplementation = route(
	createApi.todos.create,
	({ title, context }) => {
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
	},
);

expectType<typeof createApi.todos.create>(createImplementation.route);

// websocket handler request inference

// should expose path params, context, and typed outbound messages to websocket handlers
const socketApi = defineRouter({
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

type SocketRequest = RouteRequest<
	typeof socketApi.socket.room,
	TestRouteHandlerContext
>;
declare const socketRequest: SocketRequest;
expectType<string>(socketRequest.roomId);
expectType<string>(socketRequest.context.userId);
expectType<RouteSocket<typeof socketApi.socket.room>>(
	socketRequest.context.socket,
);
expectType<RouteSent<typeof socketApi.socket.room>>(
	null as unknown as Parameters<typeof socketRequest.context.socket.send>[0],
);
socketRequest.context.socket.send({
	type: "ready",
	message: { roomId: "room-1" },
});
socketRequest.context.socket.onMessage((message) => {
	expectType<RouteReceived<typeof socketApi.socket.room>>(message);
});

// route handler input and output coverage

// should use server-side transformed schema output as handler input
const transformedApi = defineRouter({
	todos: {
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
	},
});

route(transformedApi.todos.transform, ({ id, title, slug }) => {
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

// should expose selected custom body content type and payload to handlers
const customRequestApi = defineRouter({
	todos: {
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
});

route(customRequestApi.todos.uploadImage, ({ id, body }) => {
	expectType<string>(id);
	expectType<"image/png" | "image/jpeg">(body.contentType);
	expectType<Uint8Array<ArrayBuffer>>(body.payload);

	return undefined;
});

// should type websocket send and receive messages by discriminator
route(socketApi.socket.room, ({ roomId, context }) => {
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

// should expose JSON query schemas as a single typed query field
const jsonQueryApi = defineRouter({
	todos: {
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
});

route(jsonQueryApi.todos.jsonSearch, ({ query }) => {
	expectType<number>(query.page);
	expectType<string[]>(query.filters.tags);

	return [];
});

// should preserve optional JSON query input as undefined when omitted
route(jsonQueryApi.todos.optionalJsonSearch, ({ query }) => {
	expectType<{ page: number } | undefined>(query);
	if (query) {
		expectType<number>(query.page);
	}

	return [];
});

// should reject handlers that return the client-side transformed response output shape
expectError(
	route(transformedApi.todos.transform, () => ({
		status: 200 as const,
		body: {
			id: "client-output-shape",
		},
	})),
);

// should accept native server payloads for custom responses
const customResponseApi = defineRouter({
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

route(customResponseApi.reports.csv, () => ({
	status: 200 as const,
	body: "id,title\n1,First\n",
}));

async function* csvRows() {
	yield "id,title\n";
	yield "1,First\n";
}

route(customResponseApi.reports.csvStream, () => ({
	status: 200 as const,
	body: csvRows(),
}));

// should reject non-iterable payloads for custom stream responses
expectError(
	route(customResponseApi.reports.csvStream, () => ({
		status: 200 as const,
		body: "id,title\n1,First\n",
	})),
);

// router implementation inference

// should infer the complete nested implementation map from the contract
const implementationApi = defineRouter({
	todos: {
		create: createApi.todos.create,
		transform: transformedApi.todos.transform,
		jsonSearch: jsonQueryApi.todos.jsonSearch,
		optionalJsonSearch: jsonQueryApi.todos.optionalJsonSearch,
		uploadImage: customRequestApi.todos.uploadImage,
	},
	reports: {
		csv: customResponseApi.reports.csv,
		csvStream: customResponseApi.reports.csvStream,
	},
	socket: {
		room: socketApi.socket.room,
	},
});

const implementations = router(implementationApi, {
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

expectType<typeof implementationApi.todos.create>(
	implementations.todos.create.route,
);

// should accept composed routers and direct route implementations as router input
const composedTodos = router(implementationApi.todos, {
	create: route(implementationApi.todos.create, ({ title }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {
			location: "/todos/todo-1",
		},
	})),
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
	uploadImage: route(implementationApi.todos.uploadImage, () => undefined),
});

const composedReports = router(implementationApi.reports, {
	csv: route(implementationApi.reports.csv, () => ({
		status: 200 as const,
		body: "id,title\n1,First\n",
	})),
	csvStream: () => ({
		status: 200 as const,
		body: csvRows(),
	}),
});

const composedSocket = router(implementationApi.socket, {
	room: route(implementationApi.socket.room, ({ context }) => {
		context.socket.send({
			type: "ready",
			message: { roomId: "room-1" },
		});
	}),
});

const composedImplementations = router(implementationApi, {
	todos: composedTodos,
	reports: composedReports,
	socket: composedSocket,
});

expectType<typeof implementationApi.todos.create>(
	composedImplementations.todos.create.route,
);
expectType<typeof implementationApi.reports.csv>(
	composedImplementations.reports.csv.route,
);
expectType<typeof implementationApi.socket.room>(
	composedImplementations.socket.room.route,
);

// should reject class instances that do not implement required routes
class MissingCreateTodoService {
	readonly prefix = "todo";
}

expectError(router(createApi.todos, new MissingCreateTodoService()));

// should reject class instances that return the wrong route response shape
class WrongCreateTodoService {
	create({ title }: RouteRequest<typeof createApi.todos.create>) {
		return {
			id: "todo-1",
			title,
		};
	}
}

expectError(router(createApi.todos, new WrongCreateTodoService()));

// should reject incomplete classes when using the router input helper
// @ts-expect-error The class is missing the create route handler.
class MissingCheckedCreateTodoService
	implements RouteHandlers<typeof createApi.todos>
{
	readonly prefix = "todo";
}

expectError(router(createApi.todos, new MissingCheckedCreateTodoService()));

// should reject invalid class implementation
class WrongCheckedCreateTodoService
	implements RouteHandlers<typeof createApi.todos>
{
	// @ts-expect-error The class method does not return the required response envelope.
	create({ title }: RouteRequest<typeof createApi.todos.create>) {
		return {
			id: "todo-1",
			title,
		};
	}
}

expectError(router(createApi.todos, new WrongCheckedCreateTodoService()));

// should accept valid class implementation
class CheckedCreateTodoService
	implements RouteHandlers<typeof createApi.todos>
{
	readonly prefix = "todo";

	create({ title }: RouteRequest<typeof createApi.todos.create>) {
		return {
			status: 201 as const,
			body: {
				id: `${this.prefix}-1`,
				title,
			},
			responseHeaders: {
				location: "/todos/todo-1",
			},
		};
	}
}

router(createApi.todos, new CheckedCreateTodoService());

// should expose that despite using implements, TypeScript does not contextually type class methods
class _UnannotatedCheckedCreateTodoService
	implements RouteHandlers<typeof createApi.todos>
{
	// @ts-expect-error Implements checks assignability after method inference.
	create({ title }) {
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
	}
}

// should preserve route types through deeper router/router/route stacking
const stackedApi = defineRouter({
	admin: {
		v1: {
			todos: {
				create: implementationApi.todos.create,
				transform: implementationApi.todos.transform,
			},
			reports: {
				csv: implementationApi.reports.csv,
			},
		},
	},
	public: {
		todos: {
			jsonSearch: implementationApi.todos.jsonSearch,
		},
	},
});

const stackedTodoRoutes = router(stackedApi.admin.v1.todos, {
	create: route(stackedApi.admin.v1.todos.create, ({ title }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {
			location: "/todos/todo-1",
		},
	})),
	transform: route(stackedApi.admin.v1.todos.transform, ({ id }) => ({
		status: 200 as const,
		body: {
			id,
		},
	})),
});

const stackedV1Routes = router(stackedApi.admin.v1, {
	todos: stackedTodoRoutes,
	reports: {
		csv: route(stackedApi.admin.v1.reports.csv, () => ({
			status: 200 as const,
			body: "id,title\n1,First\n",
		})),
	},
});

const stackedAdminRoutes = router(stackedApi.admin, {
	v1: stackedV1Routes,
});

const stackedRoutes = router(stackedApi, {
	admin: stackedAdminRoutes,
	public: {
		todos: {
			jsonSearch: ({ query }) => {
				expectType<number>(query.page);
				expectType<string[]>(query.filters.tags);

				return [];
			},
		},
	},
});

expectType<typeof stackedApi.admin.v1.todos.create>(
	stackedRoutes.admin.v1.todos.create.route,
);
expectType<typeof stackedApi.admin.v1.reports.csv>(
	stackedRoutes.admin.v1.reports.csv.route,
);
expectType<typeof stackedApi.public.todos.jsonSearch>(
	stackedRoutes.public.todos.jsonSearch.route,
);

// should accept a compiled route in one sibling while preserving contextual typing
router(stackedApi.admin.v1.todos, {
	create: route(stackedApi.admin.v1.todos.create, ({ title }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {
			location: "/todos/todo-1",
		},
	})),
	transform: ({ id, title, slug }) => {
		expectType<number>(id);
		expectType<string>(title);
		expectType<string>(slug);

		return {
			status: 200 as const,
			body: {
				id,
			},
		};
	},
});

// should reject composed route implementations that do not match their contract slot
expectError(
	router(implementationApi.todos, {
		create: route(implementationApi.todos.transform, ({ id }) => ({
			status: 200 as const,
			body: {
				id,
			},
		})),
		transform: ({ id }) => ({
			status: 200 as const,
			body: {
				id,
			},
		}),
		jsonSearch: () => [],
		optionalJsonSearch: () => [],
		uploadImage: () => undefined,
	}),
);

// should reject composed router subtrees that do not match their contract slot
expectError(
	router(stackedApi.admin.v1, {
		todos: composedReports,
		reports: {
			csv: () => ({
				status: 200 as const,
				body: "id,title\n1,First\n",
			}),
		},
	}),
);

// should reject extra keys in mixed inline and composed router trees
expectError(
	router(stackedApi.admin.v1, {
		todos: stackedTodoRoutes,
		reports: {
			csv: () => ({
				status: 200 as const,
				body: "id,title\n1,First\n",
			}),
			unexpected: () => undefined,
		},
	}),
);

// should reject missing keys in mixed inline and composed router trees
expectError(
	router(stackedApi.admin.v1, {
		todos: stackedTodoRoutes,
	}),
);

// should reject route handlers that omit the declared response envelope
expectError(
	route(createApi.todos.create, ({ title }) => ({
		id: "todo-1",
		title,
	})),
);

// should reject route handlers that omit required declared response headers
expectError(
	route(createApi.todos.create, ({ title }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {},
	})),
);

// should reject router implementations that read fields outside flattened request input
expectError(
	router(implementationApi, {
		todos: {
			create: ({ id }) => ({
				id,
				title: "wrong request",
			}),
		},
	}),
);
