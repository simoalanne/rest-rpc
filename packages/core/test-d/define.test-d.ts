import {
	type InferRouteErrors,
	type InferRouteRequest,
	type InferRouteResponse,
	type InferRouteSuccessBody,
	noBody,
	route,
	router,
	streamBody,
} from "@contract-first-api/core/contract";
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

type GetTodoRequest = InferRouteRequest<typeof api.todos.get>;
declare const getTodoRequest: GetTodoRequest;
expectType<string>(getTodoRequest.id);
expectType<boolean | undefined>(getTodoRequest.includeDone);

type GetTodoResponse = InferRouteResponse<typeof api.todos.get>;
declare const getTodoResponse: GetTodoResponse;
expectType<200 | 404>(getTodoResponse.status);
expectType<{ id: string; title: string } | { message: string }>(
	getTodoResponse.body,
);

type GetTodoErrors = InferRouteErrors<typeof api.todos.get>;
declare const getTodoError: GetTodoErrors;
expectType<404>(getTodoError.status);
expectType<{ message: string }>(getTodoError.body);

expectType<{ id: string; title: string }>(
	null as unknown as InferRouteSuccessBody<typeof api.todos.get>,
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
	null as unknown as InferRouteResponse<
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

type HeaderMergedRequest = InferRouteRequest<typeof headerMerged.todos.list>;
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

// Stream responses cannot share a route with multiple successful statuses.
expectError(
	router({
		stream: {
			method: "GET",
			path: "/stream",
			responses: {
				200: streamBody(todoSchema),
				201: todoSchema,
			},
		},
	}),
);

// The stream response rule sees the route after common response merging.
expectError(
	router(
		{
			stream: {
				method: "GET",
				path: "/stream",
				responses: {
					200: streamBody(todoSchema),
				},
			},
		},
		{
			commonResponses: {
				201: todoSchema,
			},
		},
	),
);
