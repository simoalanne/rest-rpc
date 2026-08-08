import {
	customBody,
	type InferClientErrors,
	type InferClientRequest,
	type InferClientResponse,
	type InferClientSuccessBody,
	type InferServerRequest,
	type InferServerResponse,
	type InferServerSuccessBody,
	noBody,
	route,
	router,
	type as schemaType,
	stream,
} from "@rest-rpc/core/contract";
import { expectAssignable, expectError, expectType } from "tsd";
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
		get: {
			method: "GET",
			path: "/todos/:id",
			request: {
				params: z.object({ id: z.string() }),
				query: z.object({ includeDone: z.boolean().optional() }),
			},
			metadata: { auth: "optional" },
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

expectType<"/todos/:id">(api.todos.get.path);
expectType<"optional">(api.todos.get.metadata.auth);

type GetTodoRequest = InferServerRequest<typeof api.todos.get>;
declare const getTodoRequest: GetTodoRequest;
expectType<string>(getTodoRequest.id);
expectType<boolean | undefined>(getTodoRequest.includeDone);

type GetTodoResponse = InferClientResponse<typeof api.todos.get>;
declare const getTodoResponse: GetTodoResponse;
expectType<200 | 404>(getTodoResponse.status);
expectType<{ id: string; title: string } | { message: string }>(
	getTodoResponse.body,
);

type GetTodoErrors = InferClientErrors<typeof api.todos.get>;
declare const getTodoError: GetTodoErrors;
expectType<404>(getTodoError.status);
expectType<{ message: string }>(getTodoError.body);

expectType<{ id: string; title: string }>(
	null as unknown as InferClientSuccessBody<typeof api.todos.get>,
);

const typeOnlyResponse = route({
	method: "GET",
	path: "/type-only",
	responses: {
		200: schemaType<{ id: string; tags: string[] }>(),
	},
});

expectType<{ id: string; tags: string[] }>(
	null as unknown as InferClientSuccessBody<typeof typeOnlyResponse>,
);

const prefixed = router(
	{
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				responses: {
					200: z.array(todoSchema),
				},
			},
		},
	},
	{
		pathPrefix: "/api",
		metadata: { auth: "required" },
		commonResponses: {
			401: errorSchema,
		},
	},
);

// Router common options are reflected in the returned route type.
expectType<"/api/todos">(prefixed.todos.list.path);
expectType<"required">(prefixed.todos.list.metadata.auth);
expectType<200 | 401>(
	null as unknown as keyof typeof prefixed.todos.list.responses,
);

const metadataOverride = router(
	{
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				metadata: { auth: "optional", audit: true },
				responses: {
					200: z.array(todoSchema),
				},
			},
		},
	},
	{
		metadata: { auth: "required", source: "api" },
	},
);

// Route metadata wins over common metadata on key conflicts.
expectType<"optional">(metadataOverride.todos.list.metadata.auth);
expectType<true>(metadataOverride.todos.list.metadata.audit);
expectType<"api">(metadataOverride.todos.list.metadata.source);

const commonSuccess = router(
	{
		todos: {
			get: {
				method: "GET",
				path: "/todos/:id",
				responses: {
					404: errorSchema,
				},
			},
		},
	},
	{
		commonResponses: {
			200: todoSchema,
		},
	},
);

// Common responses participate in the same response inference as route responses.
expectType<200 | 404>(
	null as unknown as InferClientResponse<
		typeof commonSuccess.todos.get
	>["status"],
);

const headerMerged = router(
	{
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				request: {
					query: z.object({ search: z.string() }),
					headers: {
						"x-optional": z.string().optional(),
						"x-route": z.literal("route"),
						"x-shared": z.literal("route"),
					},
				},
				responses: {
					200: z.array(todoSchema),
				},
			},
		},
	},
	{
		commonHeaders: {
			"x-common": z.number(),
			"x-shared": z.literal("common"),
		},
	},
);

type HeaderMergedRequest = InferServerRequest<typeof headerMerged.todos.list>;
declare const headerMergedRequest: HeaderMergedRequest;
expectType<string>(headerMergedRequest.search);
expectType<number>(headerMergedRequest["x-common"]);
expectType<string | undefined>(headerMergedRequest["x-optional"]);
expectType<"route">(headerMergedRequest["x-route"]);
expectType<"route">(headerMergedRequest["x-shared"]);
expectAssignable<HeaderMergedRequest>({
	search: "todos",
	"x-common": 1,
	"x-route": "route",
	"x-shared": "route",
});

const objectUnionRequest = route({
	method: "GET",
	path: "/object-union",
	request: {
		query: z.union([
			z.object({ q: z.string() }),
			z.object({ page: z.number() }),
		]),
	},
	responses: {
		200: todoSchema,
	},
});

type ObjectUnionRequest = InferServerRequest<typeof objectUnionRequest>;
expectAssignable<ObjectUnionRequest>({ q: "todos" });
expectAssignable<ObjectUnionRequest>({ page: 1 });

const schemaRecordRequest = route({
	method: "POST",
	path: "/todos/:id",
	request: {
		params: {
			id: schemaType<string>(),
		},
		query: {
			includeDone: schemaType<boolean | undefined>(),
			search: z.string().optional(),
		},
		body: {
			title: schemaType<string>(),
			priority: schemaType<number | undefined>(),
		},
		headers: {
			"x-request-id": schemaType<string>(),
		},
	},
	responses: {
		200: todoSchema,
	},
});

type SchemaRecordRequest = InferServerRequest<typeof schemaRecordRequest>;
declare const schemaRecordRequestInput: SchemaRecordRequest;
expectType<string>(schemaRecordRequestInput.id);
expectType<string>(schemaRecordRequestInput.title);
expectType<string>(schemaRecordRequestInput["x-request-id"]);
expectType<boolean | undefined>(schemaRecordRequestInput.includeDone);
expectType<string | undefined>(schemaRecordRequestInput.search);
expectType<number | undefined>(schemaRecordRequestInput.priority);
expectAssignable<SchemaRecordRequest>({
	id: "todo-1",
	title: "Typed todo",
	"x-request-id": "req-1",
});

const transformed = route({
	method: "POST",
	path: "/transformed/:id",
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
});

type TransformedClientRequest = InferClientRequest<typeof transformed>;
declare const transformedClientRequest: TransformedClientRequest;
expectType<string>(transformedClientRequest.id);
expectType<string>(transformedClientRequest.title);
expectError(transformedClientRequest.slug);

type TransformedServerRequest = InferServerRequest<typeof transformed>;
declare const transformedServerRequest: TransformedServerRequest;
expectType<number>(transformedServerRequest.id);
expectType<string>(transformedServerRequest.title);
expectType<string>(transformedServerRequest.slug);

type TransformedServerResponse = InferServerResponse<typeof transformed>;
declare const transformedServerResponse: TransformedServerResponse;
expectType<200>(transformedServerResponse.status);
expectType<{ id: number }>(transformedServerResponse.body);

type TransformedClientResponse = InferClientResponse<typeof transformed>;
declare const transformedClientResponse: TransformedClientResponse;
expectType<200>(transformedClientResponse.status);
expectType<{ id: string }>(transformedClientResponse.body);
expectType<{ id: number }>(
	null as unknown as InferServerSuccessBody<typeof transformed>,
);
expectType<{ id: string }>(
	null as unknown as InferClientSuccessBody<typeof transformed>,
);

expectError(
	route({
		method: "GET",
		path: "/scalar-body",
		request: {
			body: z.string(),
		},
		responses: {
			200: todoSchema,
		},
	}),
);

expectError(
	route({
		method: "GET",
		path: "/scalar-query",
		request: {
			query: z.string(),
		},
		responses: {
			200: todoSchema,
		},
	}),
);

expectError(
	route({
		method: "GET",
		path: "/mixed-query-union",
		request: {
			query: z.union([z.object({ q: z.string() }), z.string()]),
		},
		responses: {
			200: todoSchema,
		},
	}),
);

expectError(
	route({
		method: "GET",
		path: "/scalar-params/:id",
		request: {
			params: z.string(),
		},
		responses: {
			200: todoSchema,
		},
	}),
);

expectError(
	route({
		method: "GET",
		path: "/invalid-header",
		request: {
			headers: {
				"x-object": z.object({ id: z.string() }),
			},
		},
		responses: {
			200: todoSchema,
		},
	}),
);

expectError(
	route({
		method: "GET",
		path: "/invalid-query",
		request: {
			query: {
				filter: z.object({ status: z.string() }),
			},
		},
		responses: {
			200: todoSchema,
		},
	}),
);

expectError(
	route({
		method: "GET",
		path: "/invalid-params/:id",
		request: {
			params: {
				id: z.string().optional(),
			},
		},
		responses: {
			200: todoSchema,
		},
	}),
);

expectError(
	router(
		{
			todos: {
				list: {
					method: "GET",
					path: "/todos",
					responses: {
						200: z.array(todoSchema),
					},
				},
			},
		},
		{
			commonHeaders: {
				"x-nullable": z.string().nullable(),
			},
		},
	),
);

// Single-route options are processing-only; route-shaped common fields belong on
// router().
expectError(
	route(
		{
			method: "GET",
			path: "/health",
			responses: {
				204: noBody(),
			},
		},
		{ pathPrefix: "/api" },
	),
);

// A route must declare at least one successful response.
expectError(
	router({
		missingSuccess: {
			method: "GET",
			path: "/missing-success",
			responses: {
				404: errorSchema,
			},
		},
	}),
);

const mixedStreamResponses = router({
	stream: {
		method: "GET",
		path: "/stream",
		responses: {
			200: stream(todoSchema),
			201: todoSchema,
			204: noBody(),
		},
	},
});

expectAssignable<
	| { status: 200; body: AsyncIterable<{ id: string; title: string }> }
	| { status: 201; body: { id: string; title: string } }
	| { status: 204; body: undefined }
>(null as unknown as InferClientResponse<typeof mixedStreamResponses.stream>);

const mixedStreamCommonResponses = router(
	{
		stream: {
			method: "GET",
			path: "/stream",
			responses: {
				200: stream(todoSchema),
			},
		},
	},
	{
		commonResponses: {
			201: todoSchema,
		},
	},
);

expectAssignable<
	| { status: 200; body: AsyncIterable<{ id: string; title: string }> }
	| { status: 201; body: { id: string; title: string } }
>(
	null as unknown as InferClientResponse<
		typeof mixedStreamCommonResponses.stream
	>,
);

const customSingleResponse = route({
	method: "GET",
	path: "/report.csv",
	responses: {
		200: customBody({
			contentType: "text/csv",
			schema: z.string(),
		}),
	},
});

expectType<Response>(
	null as unknown as InferClientSuccessBody<typeof customSingleResponse>,
);
expectType<string>(
	null as unknown as InferServerSuccessBody<typeof customSingleResponse>,
);

const customStreamResponse = route({
	method: "GET",
	path: "/report-stream.csv",
	responses: {
		200: stream(
			customBody({
				contentType: "text/csv",
				schema: z.string(),
			}),
		),
	},
});

expectType<Response>(
	null as unknown as InferClientSuccessBody<typeof customStreamResponse>,
);
expectType<AsyncIterable<string>>(
	null as unknown as InferServerSuccessBody<typeof customStreamResponse>,
);
