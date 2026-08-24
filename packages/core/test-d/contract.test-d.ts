import type { ClientResponse } from "@rest-rpc/core/client";
import {
	type ClientRequest,
	type ClientResponseBody,
	customBody,
	jsonQuery,
	noBody,
	route,
	router,
	type ServerRequest,
	type ServerResponse,
	type ServerSuccessBody,
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

// response helper types

// should resolve declared client response, error, and success-body helper types
const responseRoute = route({
	method: "GET",
	path: "/todos/:id",
	pathParams: z.object({ id: z.string() }),
	query: z.object({ includeDone: z.boolean().optional() }),
	responses: {
		200: todoSchema,
		404: errorSchema,
	},
});

type DeclaredClientResponse<T> = Extract<T, { declared: true }>;
type GetTodoResponse = DeclaredClientResponse<
	ClientResponse<typeof responseRoute>
>;
declare const getTodoResponse: GetTodoResponse;
expectType<200 | 404>(getTodoResponse.status);
expectType<{ id: string; title: string } | { message: string }>(
	getTodoResponse.body,
);

type GetTodoErrors = Extract<GetTodoResponse, { status: 404 }>;
declare const getTodoError: GetTodoErrors;
expectType<404>(getTodoError.status);
expectType<{ message: string }>(getTodoError.body);

expectType<{ id: string; title: string }>(
	null as unknown as ClientResponseBody<typeof responseRoute>,
);

// response shorthand

// should default POST response shorthand to 201
const postResponseShorthand = route({
	method: "POST",
	path: "/todos",
	body: z.object({ title: z.string() }),
	response: todoSchema,
});

expectType<201>(
	null as unknown as DeclaredClientResponse<
		ClientResponse<typeof postResponseShorthand>
	>["status"],
);
expectType<{ id: string; title: string }>(
	null as unknown as ClientResponseBody<typeof postResponseShorthand>,
);

// should default non-POST response shorthand to 200
const deleteResponseShorthand = route({
	method: "DELETE",
	path: "/todos/:id",
	response: todoSchema,
});

expectType<200>(
	null as unknown as DeclaredClientResponse<
		ClientResponse<typeof deleteResponseShorthand>
	>["status"],
);
expectType<{ id: string; title: string }>(
	null as unknown as ClientResponseBody<typeof deleteResponseShorthand>,
);

// should default omitted non-GET responses to 204 no body
const omittedResponseShorthand = route({
	method: "DELETE",
	path: "/todos/:id",
});

expectType<204>(
	null as unknown as DeclaredClientResponse<
		ClientResponse<typeof omittedResponseShorthand>
	>["status"],
);
expectType<undefined>(
	null as unknown as ClientResponseBody<typeof omittedResponseShorthand>,
);

// should merge response shorthand with router common responses
const shorthandWithCommonResponses = router(
	{
		todos: {
			create: {
				method: "POST",
				path: "/todos",
				response: todoSchema,
			},
		},
	},
	{
		commonResponses: {
			401: errorSchema,
		},
	},
);

expectType<201 | 401>(
	null as unknown as DeclaredClientResponse<
		ClientResponse<typeof shorthandWithCommonResponses.todos.create>
	>["status"],
);

// should reject mixing response shorthand with explicit response maps
expectError(
	route({
		method: "GET",
		path: "/both-response-fields",
		response: todoSchema,
		responses: {
			200: todoSchema,
		},
	}),
);

// should carry type-only response schemas into success-body helpers
const typeOnlyResponse = route({
	method: "GET",
	path: "/type-only",
	responses: {
		200: schemaType<{ id: string; tags: string[] }>(),
	},
});

expectType<{ id: string; tags: string[] }>(
	null as unknown as ClientResponseBody<typeof typeOnlyResponse>,
);

// request helper types

// should infer supported path params while ignoring invalid partial segments
const inferredPathParams = route({
	method: "GET",
	path: "/orgs/{orgId}/todos/:id/invalid-{segment}/other:invalid/:probably:invalid",
	query: z.object({ includeDone: z.boolean().optional() }),
	responses: {
		200: todoSchema,
	},
});

type InferredPathParamsClientRequest = ClientRequest<typeof inferredPathParams>;
declare const inferredPathParamsClientRequest: InferredPathParamsClientRequest;
expectType<string>(inferredPathParamsClientRequest.id);
expectType<string>(inferredPathParamsClientRequest.orgId);
expectType<boolean | undefined>(inferredPathParamsClientRequest.includeDone);
expectAssignable<InferredPathParamsClientRequest>({
	id: "todo-1",
	includeDone: true,
	orgId: "org-1",
	"probably:invalid": "value",
});

type InferredPathParamsServerRequest = ServerRequest<typeof inferredPathParams>;
declare const inferredPathParamsServerRequest: InferredPathParamsServerRequest;
expectType<string>(inferredPathParamsServerRequest.id);
expectType<string>(inferredPathParamsServerRequest.orgId);
expectType<boolean | undefined>(inferredPathParamsServerRequest.includeDone);

// should support object-union request schemas as flattened server input
const objectUnionRequest = route({
	method: "GET",
	path: "/object-union",
	query: z.union([z.object({ q: z.string() }), z.object({ page: z.number() })]),
	responses: {
		200: todoSchema,
	},
});

type ObjectUnionRequest = ServerRequest<typeof objectUnionRequest>;
expectAssignable<ObjectUnionRequest>({ q: "todos" });
expectAssignable<ObjectUnionRequest>({ page: 1 });

// should support schema-record request segments with optional fields
const schemaRecordRequest = route({
	method: "POST",
	path: "/todos/:id",
	pathParams: {
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
	responses: {
		200: todoSchema,
	},
});

type SchemaRecordRequest = ServerRequest<typeof schemaRecordRequest>;
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

// router common options

// should keep common path prefixes and metadata loose while merging response statuses
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

expectType<string>(prefixed.todos.list.path);
expectType<Record<string, unknown>>(prefixed.todos.list.metadata);
expectType<200 | 401>(
	null as unknown as keyof typeof prefixed.todos.list.responses,
);

// should let route headers override common headers with the same key
const headerMerged = router(
	{
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				query: z.object({ search: z.string() }),
				headers: {
					"x-optional": z.string().optional(),
					"x-route": z.literal("route"),
					"x-shared": z.literal("route"),
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

type HeaderMergedRequest = ServerRequest<typeof headerMerged.todos.list>;
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

// should infer grouped request segments when flattened request keys are disabled
const groupedRequestApi = router(
	{
		todos: {
			update: {
				method: "PATCH",
				path: "/todos/:id",
				pathParams: z.object({ id: z.string() }),
				query: z.object({ notify: z.boolean().optional() }),
				body: z.object({ title: z.string() }),
				headers: {
					"x-request-id": z.string(),
				},
				responses: {
					200: todoSchema,
				},
			},
		},
	},
	{
		flattenRequestKeys: false,
	},
);

type GroupedClientRequest = ClientRequest<
	typeof groupedRequestApi.todos.update
>;
declare const groupedClientRequest: GroupedClientRequest;
expectType<string>(groupedClientRequest.pathParams.id);
expectType<boolean | undefined>(groupedClientRequest.query.notify);
expectType<string>(groupedClientRequest.body.title);
expectType<string>(groupedClientRequest.headers["x-request-id"]);
expectAssignable<GroupedClientRequest>({
	pathParams: { id: "todo-1" },
	query: {},
	body: { title: "Typed todo" },
	headers: { "x-request-id": "req-1" },
});
expectError(groupedClientRequest.id);
expectError(groupedClientRequest.title);

// should let route-level flattenRequestKeys override the router option
const routeOverrideRequestApi = router(
	{
		todos: {
			get: {
				method: "GET",
				path: "/todos/:id",
				flattenRequestKeys: true,
				pathParams: z.object({ id: z.string() }),
				query: z.object({ preview: z.boolean().optional() }),
				responses: {
					200: todoSchema,
				},
			},
		},
	},
	{
		flattenRequestKeys: false,
	},
);

type RouteOverrideClientRequest = ClientRequest<
	typeof routeOverrideRequestApi.todos.get
>;
declare const routeOverrideClientRequest: RouteOverrideClientRequest;
expectType<string>(routeOverrideClientRequest.id);
expectType<boolean | undefined>(routeOverrideClientRequest.preview);
expectError(routeOverrideClientRequest.pathParams);

// customBody or jsonQuery should not become double-wrapped when flattenRequestKeys is false
const streamOrJsonQueryApi = router(
	{
		todos: {
			list: {
				path: "/todos",
				method: "GET",
				body: customBody({
					contentType: "application/json",
					schema: z.object({ filter: z.string() }),
				}),
				query: jsonQuery(z.object({ page: z.number() })),
				responses: {
					200: stream(todoSchema),
				},
			},
		},
	},
	{
		flattenRequestKeys: false,
	},
);

declare const streamOrJsonQueryRequest: ClientRequest<
	typeof streamOrJsonQueryApi.todos.list
>;
expectType<string>(streamOrJsonQueryRequest.body.filter);
expectType<number>(streamOrJsonQueryRequest.query.page);
expectError(streamOrJsonQueryRequest.query.query);

// transformed schemas

// should separate client input, server input, server output, and client output types
const transformed = route({
	method: "POST",
	path: "/transformed/:id",
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
});

type TransformedClientRequest = ClientRequest<typeof transformed>;
declare const transformedClientRequest: TransformedClientRequest;
expectType<string>(transformedClientRequest.id);
expectType<string>(transformedClientRequest.title);
expectError(transformedClientRequest.slug);

type TransformedServerRequest = ServerRequest<typeof transformed>;
declare const transformedServerRequest: TransformedServerRequest;
expectType<number>(transformedServerRequest.id);
expectType<string>(transformedServerRequest.title);
expectType<string>(transformedServerRequest.slug);

type TransformedServerResponse = ServerResponse<typeof transformed>;
declare const transformedServerResponse: TransformedServerResponse;
expectType<200>(transformedServerResponse.status);
expectType<{ id: number }>(transformedServerResponse.body);

type TransformedClientResponse = ClientResponse<typeof transformed>;
declare const transformedClientResponse: DeclaredClientResponse<TransformedClientResponse>;
expectType<200>(transformedClientResponse.status);
expectType<{ id: string }>(transformedClientResponse.body);
expectType<{ id: number }>(
	null as unknown as ServerSuccessBody<typeof transformed>,
);
expectType<{ id: string }>(
	null as unknown as ClientResponseBody<typeof transformed>,
);

// intentionally loose route declarations

// should accept schemas that runtime contract validation will reject later
route({
	method: "GET",
	path: "/scalar-query",
	query: z.string(),
	responses: {
		200: todoSchema,
	},
});

route({
	method: "GET",
	path: "/object-header",
	headers: {
		"x-object": z.object({ id: z.string() }),
	},
	responses: {
		200: todoSchema,
	},
});

// should reject router-only options on single route declarations
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

// should allow route declarations that have no success response until runtime validation
router({
	missingSuccess: {
		method: "GET",
		path: "/missing-success",
		responses: {
			404: errorSchema,
		},
	},
});

// stream and custom body responses

// should preserve mixed stream, JSON, and no-body response unions
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
>(
	null as unknown as DeclaredClientResponse<
		ClientResponse<typeof mixedStreamResponses.stream>
	>,
);

// should expose custom single responses as native Response on the client and payload on the server
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
	null as unknown as ClientResponseBody<typeof customSingleResponse>,
);
expectType<string>(
	null as unknown as ServerSuccessBody<typeof customSingleResponse>,
);

// should expose custom stream responses as Response on the client and async iterable payloads on the server
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
	null as unknown as ClientResponseBody<typeof customStreamResponse>,
);
expectType<AsyncIterable<string>>(
	null as unknown as ServerSuccessBody<typeof customStreamResponse>,
);

// should reject customBody without a contentType for responses,
// because server-side must know how to serialize the response body
expectError(
	route({
		method: "GET",
		path: "/raw-report",
		responses: {
			200: customBody(z.string()),
		},
	}),
);

// should also reject customBody without a contentType for stream responses,
// because server-side must know how to serialize the response body
expectError(
	route({
		method: "GET",
		path: "/raw-report-stream",
		responses: {
			200: stream(customBody(z.string())),
		},
	}),
);
