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
	},
);

// Current return types preserve the input route shape; runtime normalization is not
// reflected yet.
expectType<"/todos">(prefixed.todos.list.path);
expectError(prefixed.todos.list.metadata);

const singleRoute = route(
	{
		method: "GET",
		path: "/health",
		responses: {
			204: noBody(),
		},
	},
	{ pathPrefix: "/api" },
);

expectType<"/health">(singleRoute.path);

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
