import { route as coreRoute } from "@rest-rpc/core";
import {
	type RouteHandlers,
	type RouteRequest,
	type RouteRequestData,
	type RouteResponse,
	RouteResponseError,
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

// should expose grouped request fields and adapter context to route handlers
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
expectType<string>(createTodoRequest.body.title);
expectType<TestRouteHandlerContext>(createTodoRequest.context);

type CreateTodoRequestData = RouteRequestData<typeof createApi.todos.create>;
declare const createTodoRequestData: CreateTodoRequestData;
expectType<string>(createTodoRequestData.body.title);

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
expectType<true>(composedHeadersRequest.headers.authenticated);
expectType<"request-1">(composedHeadersRequest.headers.traceId);

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
	({ context, body: { title } }) => {
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

route(
	transformedApi.todos.transform,
	({ params: { id }, body: { title, slug } }) => {
		expectType<number>(id);
		expectType<string>(title);
		expectType<string>(slug);

		return {
			status: 200 as const,
			body: {
				id: 1,
			},
		};
	},
);

// should expose single custom body content types as payloads to handlers
const singleCustomRequestApi = {
	todos: {
		importCsv: coreRoute
			.post("/todos/import.csv")
			.customBody({
				contentType: "text/csv",
				schema: z.string(),
			})
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

route(customRequestApi.todos.uploadImage, ({ body, params: { id } }) => {
	expectType<string>(id);
	expectType<"image/png" | "image/jpeg">(body.contentType);
	expectType<Uint8Array<ArrayBuffer>>(body.payload);

	return undefined;
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
		csv: coreRoute.get("/reports.csv").customResponse(200, {
			contentType: "text/csv",
			schema: z.string(),
		}),
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

const transformedCustomResponse = coreRoute
	.get("/transformed-report.txt")
	.customResponse(200, {
		contentType: "text/plain",
		schema: z.number().transform(String),
	});
route(transformedCustomResponse, () => ({ status: 200 as const, body: 42 }));
expectError(
	route(transformedCustomResponse, () => ({
		status: 200 as const,
		body: "42",
	})),
);

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
} as const;

const implementations = router(implementationApi, {
	todos: {
		create: ({ body: { title } }) => ({
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
		transform: ({ params: { id } }) => ({
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
});

expectType<typeof implementationApi.todos.create>(
	implementations.todos.create.route,
);

// should accept composed routers and direct route implementations as router input
const composedTodos = router(implementationApi.todos, {
	create: route(implementationApi.todos.create, ({ body: { title } }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {
			location: "/todos/todo-1",
		},
	})),
	transform: ({ params: { id } }) => ({
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

const composedImplementations = router(implementationApi, {
	todos: composedTodos,
	reports: composedReports,
});

expectType<typeof implementationApi.todos.create>(
	composedImplementations.todos.create.route,
);
expectType<typeof implementationApi.reports.csv>(
	composedImplementations.reports.csv.route,
);

// should reject class instances that do not implement required routes
class MissingCreateTodoService {
	readonly prefix = "todo";
}

expectError(router(createApi.todos, new MissingCreateTodoService()));

// should reject class instances that return the wrong route response shape
class WrongCreateTodoService {
	create({ body: { title } }: RouteRequest<typeof createApi.todos.create>) {
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
	create({ body: { title } }: RouteRequest<typeof createApi.todos.create>) {
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

	create({ body: { title } }: RouteRequest<typeof createApi.todos.create>) {
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
	create: route(stackedApi.admin.v1.todos.create, ({ body: { title } }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {
			location: "/todos/todo-1",
		},
	})),
	transform: route(
		stackedApi.admin.v1.todos.transform,
		({ params: { id } }) => ({
			status: 200 as const,
			body: {
				id,
			},
		}),
	),
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
	create: route(stackedApi.admin.v1.todos.create, ({ body: { title } }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {
			location: "/todos/todo-1",
		},
	})),
	transform: ({ params: { id }, body: { title, slug } }) => {
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
		create: route(implementationApi.todos.transform, ({ params: { id } }) => ({
			status: 200 as const,
			body: {
				id,
			},
		})),
		transform: ({ params: { id } }) => ({
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
	route(createApi.todos.create, ({ body: { title } }) => ({
		id: "todo-1",
		title,
	})),
);

// should reject route handlers that omit required declared response headers
expectError(
	route(createApi.todos.create, ({ body: { title } }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
		responseHeaders: {},
	})),
);

// should reject router implementations that read fields outside declared request segments
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
