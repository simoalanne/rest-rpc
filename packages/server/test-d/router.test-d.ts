import { route as coreRoute } from "@rest-rpc/core";
import {
	type RouteHandlers,
	type RouteReceived,
	type RouteRequest,
	type RouteRequestData,
	type RouteResponse,
	type RouteSent,
	type RouteSocket,
	type RouteSseSent,
	type SseEvent,
	RouteResponseError,
	route,
	router,
	sseEvent,
} from "@rest-rpc/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

type TestRouteHandlerContext = {
	userId: string;
};

type RequestSignalRouteHandlerContext = TestRouteHandlerContext & {
	signal: AbortSignal;
};

const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
});

// route handler request inference

// should expose flattened request fields and adapter context to route handlers
const createApi = {
	todos: {
		create: coreRoute
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, {
				body: todoSchema,
				headers: z.object({
					location: z.string(),
					"x-next-cursor": z.string().optional(),
				}),
			}),
	},
} as const;

const transformedResponseHeadersApi = {
	todos: {
		get: coreRoute.get("/todos/transformed-headers").response(200, {
			body: todoSchema,
			headers: z.string().transform((value) => ({ etag: value })),
		}),
	},
} as const;

type TransformedResponseHeaders = RouteResponse<
	typeof transformedResponseHeadersApi.todos.get
>;
declare const transformedResponse: TransformedResponseHeaders;
expectType<string>(transformedResponse.responseHeaders);

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

const composedHeadersApi = {
	items: {
		get: coreRoute
			.with({
				headers: z
					.object({ authorization: z.string() })
					.transform(() => ({ authenticated: true as const })),
			})
			.get("/items")
			.headers(
				z
					.object({ "x-request-id": z.string() })
					.transform(() => ({ traceId: "request-1" as const })),
			)
			.response(204),
	},
} as const;

type ComposedHeadersRequest = RouteRequestData<
	typeof composedHeadersApi.items.get
>;
declare const composedHeadersRequest: ComposedHeadersRequest;
expectType<true>(composedHeadersRequest.authenticated);
expectType<"request-1">(composedHeadersRequest.traceId);

type CreateTodoResponse = RouteResponse<typeof createApi.todos.create>;
declare const createTodoResponse: CreateTodoResponse;
expectType<201>(createTodoResponse.status);

const errorApi = {
	todos: {
		get: coreRoute
			.get("/todos/:id")
			.response(200, todoSchema)
			.response(404, z.object({ code: z.literal("TODO_NOT_FOUND") })),
		create: coreRoute
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, todoSchema)
			.response(409, z.object({ code: z.literal("TODO_ALREADY_EXISTS") })),
	},
} as const;

// should allow response envelope that's part of the route scope
new RouteResponseError(errorApi, {
	status: 404,
	body: { code: "TODO_NOT_FOUND" },
});
new RouteResponseError(errorApi.todos, {
	status: 404,
	body: { code: "TODO_NOT_FOUND" },
});

// should allow response envelope that's declared for the route
new RouteResponseError(errorApi.todos.create, {
	status: 409,
	body: { code: "TODO_ALREADY_EXISTS" },
});

// should not allow response envelope that's not declared for the route
expectError(
	new RouteResponseError(errorApi.todos.get, {
		status: 409,
		body: { code: "TODO_ALREADY_EXISTS" },
	}),
);

// should not allow response envelope that's not declared for the route scope
expectError(
	new RouteResponseError(errorApi, {
		status: 405,
		body: { code: "TODO_ALREADY_EXISTS" },
	}),
);

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

const responseEnvelopeBodyApi = {
	jobs: {
		get: coreRoute.get("/jobs/:id").response(
			200,
			z.object({
				status: z.number(),
				body: z.string(),
			}),
		),
	},
} as const;

// Should not accept shorthand response when it's ambiguous
expectError(
	route(responseEnvelopeBodyApi.jobs.get, () => ({
		status: 123,
		body: "running",
	})),
);

// Should still accept explicit response envelope
route(responseEnvelopeBodyApi.jobs.get, () => ({
	status: 200,
	body: {
		status: 123,
		body: "running",
	},
}));

const optionalStatusBodyApi = {
	jobs: {
		get: coreRoute.get("/jobs/:id").response(
			200,
			z.object({
				id: z.string(),
				status: z.string().optional(),
			}),
		),
	},
} as const;

// Should not accept shorthand response when it may include a reserved envelope key
expectError(
	route(optionalStatusBodyApi.jobs.get, () => ({
		id: "job-1",
		status: "running",
	})),
);

// Should still accept explicit response envelope for bodies with optional status
route(optionalStatusBodyApi.jobs.get, () => ({
	status: 200,
	body: {
		id: "job-1",
		status: "running",
	},
}));

// websocket handler request inference

// should expose path params, context, and typed outbound messages to websocket handlers
const socketApi = {
	socket: {
		room: coreRoute
			.ws("/rooms/:roomId")
			.params(z.object({ roomId: z.string() }))
			.clientMessage("echo", z.object({ text: z.string() }))
			.clientMessage(
				"count",
				z.object({ value: z.string().transform((value) => Number(value)) }),
			)
			.serverMessage("ready", z.object({ roomId: z.string() }))
			.serverMessage(
				"counted",
				z.object({ value: z.string().transform((value) => Number(value)) }),
			),
	},
} as const;

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

// sse handler request inference

// should expose path params, context, and typed outbound events to sse handlers
const sseApi = {
	events: {
		notifications: coreRoute
			.sse("/events/:projectId")
			.params(z.object({ projectId: z.string() }))
			.query(z.object({ includeDone: z.boolean().optional() }))
			.response(
				z.object({
					id: z.string(),
					createdAt: z.string().transform((value) => new Date(value)),
				}),
			),
	},
} as const;

type SseRequest = RouteRequest<
	typeof sseApi.events.notifications,
	TestRouteHandlerContext
>;
declare const sseRequest: SseRequest;
expectType<string>(sseRequest.projectId);
expectType<boolean | undefined>(sseRequest.includeDone);
expectType<string>(sseRequest.context.userId);
expectError(sseRequest.context.signal);
expectType<string | undefined>(sseRequest.context.lastEventId);

type SseRequestWithSignal = RouteRequest<
	typeof sseApi.events.notifications,
	RequestSignalRouteHandlerContext
>;
declare const sseRequestWithSignal: SseRequestWithSignal;
expectType<AbortSignal>(sseRequestWithSignal.context.signal);
expectType<string | undefined>(sseRequestWithSignal.context.lastEventId);

expectType<RouteSseSent<typeof sseApi.events.notifications>>({
	id: "event-1",
	createdAt: "2026-08-27T00:00:00.000Z",
});
expectType<SseEvent<RouteSseSent<typeof sseApi.events.notifications>>>(
	sseEvent({
		id: "event-1",
		createdAt: "2026-08-27T00:00:00.000Z",
	}),
);

route(sseApi.events.notifications, async function* ({ context }) {
	expectType<unknown>(context.signal);
	expectType<string | undefined>(context.lastEventId);

	yield sseEvent({
		id: "event-1",
		createdAt: "2026-08-27T00:00:00.000Z",
	});
});

expectError(
	route(sseApi.events.notifications, async function* () {
		yield {
			id: "event-1",
			createdAt: "2026-08-27T00:00:00.000Z",
		};
	}),
);

// it should not allow response envelope for an sse handler
expectError(
	route(sseApi.events.notifications, () => ({
		status: 200,
		body: (async function* () {
			yield sseEvent({
				id: "event-1",
				createdAt: "2026-08-27T00:00:00.000Z",
			});
		})(),
		headers: {
			"cache-control": "private",
		},
	})),
);

expectError(
	router(sseApi, {
		events: {
			notifications: () => ({
				status: 200,
				body: (async function* () {
					yield sseEvent({
						id: "event-1",
						createdAt: "2026-08-27T00:00:00.000Z",
					});
				})(),
				headers: {
					"cache-control": "private",
				},
			}),
		},
	}),
);

// route handler input and output coverage

// should use server-side transformed schema output as handler input
const transformedApi = {
	todos: {
		transform: coreRoute
			.post("/todos/:id/transform")
			.params(
				z.object({ id: z.string() }).transform(({ id }) => ({
					id: Number(id),
				})),
			)
			.body(
				z.object({ title: z.string() }).transform(({ title }) => ({
					title: title.trim(),
					slug: title.toLowerCase(),
				})),
			)
			.response(
				200,
				z.object({ id: z.number() }).transform(({ id }) => ({
					id: String(id),
				})),
			),
	},
} as const;

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

// should expose single custom body content types as payloads to handlers
const singleCustomRequestApi = {
	todos: {
		importCsv: coreRoute
			.post("/todos/import.csv")
			.customBody({ contentType: "text/csv", schema: z.string() })
			.response(204),
	},
} as const;

route(singleCustomRequestApi.todos.importCsv, ({ body }) => {
	expectType<string>(body);
	expectError(body.contentType);
	expectError(body.payload);

	return undefined;
});

// should expose omitted custom body content types as payloads to handlers
const omittedCustomRequestApi = {
	todos: {
		submitForm: coreRoute
			.post("/todos/form")
			.customBody(z.instanceof(URLSearchParams))
			.response(204),
	},
} as const;

route(omittedCustomRequestApi.todos.submitForm, ({ body }) => {
	expectType<URLSearchParams>(body);
	expectError(body.contentType);
	expectError(body.payload);

	return undefined;
});

// should expose validated urlencoded form bodies to handlers
const formRequestApi = {
	todos: {
		submitForm: coreRoute
			.post("/todos/form")
			.formBody(
				z.object({
					title: z.string(),
					count: z.coerce.number<number>(),
				}),
			)
			.response(204),
	},
} as const;

route(formRequestApi.todos.submitForm, ({ body }) => {
	expectType<{
		title: string;
		count: number;
	}>(body);

	return undefined;
});

// should expose selected custom body content type and payload to handlers
const customRequestApi = {
	todos: {
		uploadImage: coreRoute
			.post("/todos/:id/image")
			.params(z.object({ id: z.string() }))
			.customBody({
				contentType: ["image/png", "image/jpeg"],
				schema: z.instanceof(Uint8Array),
			})
			.response(204),
	},
} as const;

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
		if (message.type === "echo") {
			expectType<string>(message.message.text);
		} else {
			expectType<"count">(message.type);
			expectType<number>(message.message.value);
		}
	});
});

// should expose JSON query schemas as a single typed query field
const jsonQueryApi = {
	todos: {
		jsonSearch: coreRoute
			.get("/todos/json-search")
			.jsonQuery(
				z.object({
					page: z.string().transform((value) => Number(value)),
					filters: z.object({ tags: z.array(z.string()) }),
				}),
			)
			.response(200, z.array(todoSchema)),
		optionalJsonSearch: coreRoute
			.get("/todos/optional-json-search")
			.jsonQuery(z.object({ page: z.number() }).optional())
			.response(200, z.array(todoSchema)),
	},
} as const;

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
const customResponseApi = {
	reports: {
		csv: coreRoute
			.get("/reports.csv")
			.customResponse(200, { contentType: "text/csv", schema: z.string() }),
		csvStream: coreRoute.get("/reports-stream.csv").customStreamResponse(200, {
			contentType: "text/csv",
			schema: z.string(),
		}),
	},
} as const;

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
const implementationApi = {
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
} as const;

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
class MissingCheckedCreateTodoService implements RouteHandlers<
	typeof createApi.todos
> {
	readonly prefix = "todo";
}

expectError(router(createApi.todos, new MissingCheckedCreateTodoService()));

// should reject invalid class implementation
class WrongCheckedCreateTodoService implements RouteHandlers<
	typeof createApi.todos
> {
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
class CheckedCreateTodoService implements RouteHandlers<
	typeof createApi.todos
> {
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
class _UnannotatedCheckedCreateTodoService implements RouteHandlers<
	typeof createApi.todos
> {
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
const stackedApi = {
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
} as const;

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
