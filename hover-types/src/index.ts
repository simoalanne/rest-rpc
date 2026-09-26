import { initClient, route, type as schemaType } from "@rest-rpc/core";
import type { ClientRequest, ClientResponse, SseEvent } from "@rest-rpc/core";
import { implement as expressImplement, sse } from "@rest-rpc/express";
import {
	createRouteHandler as createFetchRouteHandler,
	route as fetchRoute,
	type InferredRouteResponse,
} from "@rest-rpc/fetch";
import type {
	RouteErrors,
	RouteHandler,
	RouteRequest,
	RouteRequestData,
	RouteResponse,
} from "@rest-rpc/express";
import {
	createRouteHandler as createNodeRouteHandler,
	route as nodeRoute,
} from "@rest-rpc/node";
import {
	createTanstackQueryHelpers,
	type RouteInfiniteQueryData,
	type RouteMutationVariables,
	type RouteQueryData,
	type RouteQueryError,
	type RouteStreamedQueryData,
} from "@rest-rpc/tanstack-query";

export const hoverApi = {
	todos: {
		get: route
			.get("/todos/:id")
			.params(schemaType<{ id: string }>())
			.query(schemaType<{ includeDone?: boolean }>())
			.response(200, schemaType<{ id: string; title: string }>())
			.response(404, schemaType<{ code: "TODO_NOT_FOUND" }>()),
		page: route
			.get("/todos/page")
			.query(
				schemaType<{
					cursor?: string;
					status: "open" | "done";
					limit: number;
				}>(),
			)
			.response(
				200,
				schemaType<{
					items: Array<{ id: string; title: string }>;
					nextCursor?: string;
				}>(),
			),
		create: route
			.post("/todos")
			.body(schemaType<{ title: string }>())
			.response(201, schemaType<{ id: string; title: string }>(), {
				headers: schemaType<{ location: string; "x-next-cursor"?: string }>(),
			})
			.response(400, schemaType<{ code: "INVALID_TODO" }>()),
		download: route
			.get("/todos/:id/export")
			.params(schemaType<{ id: string }>())
			.response(200, schemaType<Uint8Array>(), {
				contentType: ["text/csv", "application/json"] as const,
			}),
		events: route
			.get("/todos/events")
			.streamResponse(200, schemaType<{ id: string; message: string }>()),
		remove: route
			.delete("/todos/:id")
			.params(schemaType<{ id: string }>())
			.response(204)
			.response(404, schemaType<{ code: "TODO_NOT_FOUND" }>()),
	},
};

export const hoverClient = initClient(hoverApi, {
	baseUrl: "https://example.test",
});
export const hoverSseEvent = sse({
	data: { id: "todo-1", message: "Created" },
	id: "event-1",
});
export type HoverSseEvent = SseEvent<{ id: string; message: string }>;

export const declaredHoverApi = {
	todos: {
		create: route
			.post("/todos")
			.body(schemaType<{ title: string }>())
			.response(201, schemaType<{ id: string; title: string }>(), {
				headers: schemaType<{
					location: string;
					"x-next-cursor"?: string;
				}>(),
			})
			.response(400, schemaType<{ code: "INVALID_TODO" }>()),
	},
};

export const declaredHoverClient = initClient(declaredHoverApi, {
	baseUrl: "https://example.test",
});

export const hoverQuery = createTanstackQueryHelpers(hoverApi, {
	baseUrl: "https://example.test",
});

export const declaredHoverQuery = createTanstackQueryHelpers(declaredHoverApi, {
	baseUrl: "https://example.test",
});

export const createTodoServerRoute = expressImplement(
	hoverApi.todos.create,
).handler(({ body: { title } }) => ({
	status: 201,
	body: { id: "todo-1", title },
	responseHeaders: { location: "/todos/todo-1" },
}));

export const createTodoFetchPromise = hoverClient.todos.create({
	body: {
		title: "Write hover tests",
	},
});

export const createTodoFetchResponsePromise = hoverClient.todos.create({
	body: {
		title: "Write hover tests",
	},
});

export const createTodoMutationOptions =
	hoverQuery.todos.create.mutationOptions({
		onSuccess(_data) {
			void _data;
		},
		onError(_error) {
			void _error;
		},
	});

export const getTodoQueryOptions = hoverQuery.todos.get.queryOptions({
	params: { id: "todo-1" },
	query: { includeDone: false },
});

export const pageTodoInfiniteQueryOptions =
	hoverQuery.todos.page.infiniteQueryOptions({
		initialRequest: {
			query: {
				status: "open",
				limit: 25,
			},
		},
		getNextRequest(lastPage) {
			return lastPage.body.nextCursor === undefined
				? undefined
				: {
						query: {
							cursor: lastPage.body.nextCursor,
							status: "open",
							limit: 25,
						},
					};
		},
	});

export const eventsStreamedQueryOptions =
	hoverQuery.todos.events.streamedQueryOptions();

type GetTodoRoute = typeof hoverApi.todos.get;
type PageTodoRoute = typeof hoverApi.todos.page;
type CreateTodoRoute = typeof hoverApi.todos.create;
type DownloadTodoRoute = typeof hoverApi.todos.download;
type EventsRoute = typeof hoverApi.todos.events;
type RemoveTodoRoute = typeof hoverApi.todos.remove;
type DeclaredCreateTodoRoute = typeof declaredHoverApi.todos.create;

export type GetClientRequest = ClientRequest<GetTodoRoute>;
export type CreateClientRequest = ClientRequest<CreateTodoRoute>;
export type PageClientRequest = ClientRequest<PageTodoRoute>;
export type RemoveClientRequest = ClientRequest<RemoveTodoRoute>;

export type CreateClientResponse = ClientResponse<CreateTodoRoute>;
export type CreateDeclaredClientResponse =
	ClientResponse<DeclaredCreateTodoRoute>;

export type CreateFetchParameters = Parameters<typeof hoverClient.todos.create>;
export type CreateFetchReturn = ReturnType<typeof hoverClient.todos.create>;
export type CreateFetchResponseParameters = Parameters<
	typeof hoverClient.todos.create
>;
export type CreateFetchResponseReturn = ReturnType<
	typeof hoverClient.todos.create
>;
export type DeclaredCreateFetchResponseReturn = ReturnType<
	typeof declaredHoverClient.todos.create
>;

export type GetQueryOptionsParameters = Parameters<
	typeof hoverQuery.todos.get.queryOptions
>;
export type GetQueryOptionsReturn = ReturnType<
	typeof hoverQuery.todos.get.queryOptions
>;
export type CreateMutationOptionsParameters = Parameters<
	typeof hoverQuery.todos.create.mutationOptions
>;
export type CreateMutationOptionsReturn = ReturnType<
	typeof hoverQuery.todos.create.mutationOptions
>;
export type PageInfiniteQueryOptionsParameters = Parameters<
	typeof hoverQuery.todos.page.infiniteQueryOptions
>;
export type PageInfiniteQueryOptionsReturn = ReturnType<
	typeof hoverQuery.todos.page.infiniteQueryOptions
>;
export type EventsStreamedQueryOptionsParameters = Parameters<
	typeof hoverQuery.todos.events.streamedQueryOptions
>;
export type EventsStreamedQueryOptionsReturn = ReturnType<
	typeof hoverQuery.todos.events.streamedQueryOptions
>;

export type CreateRouteMutationVariables =
	RouteMutationVariables<CreateTodoRoute>;
export type CreateRouteQueryData = RouteQueryData<CreateTodoRoute>;
export type CreateRouteQueryError = RouteQueryError<CreateTodoRoute>;
export type CreateDeclaredRouteQueryError =
	RouteQueryError<DeclaredCreateTodoRoute>;
export type PageRouteInfiniteQueryData = RouteInfiniteQueryData<PageTodoRoute>;
export type EventsRouteStreamedQueryData = RouteStreamedQueryData<EventsRoute>;

export type CreateExpressRouteRequest = RouteRequest<CreateTodoRoute>;
export type CreateExpressRouteRequestData = RouteRequestData<CreateTodoRoute>;
export type CreateExpressRouteHandler = RouteHandler<CreateTodoRoute>;
export type CreateExpressRouteHandlerParameters = Parameters<
	RouteHandler<CreateTodoRoute>
>;
export type CreateExpressRouteHandlerReturn = ReturnType<
	RouteHandler<CreateTodoRoute>
>;
export type CreateExpressRouteResponse = RouteResponse<CreateTodoRoute>;
export type CreateExpressRouteErrors = RouteErrors<CreateTodoRoute>;
export type CreateExpressRouteImplementation = typeof createTodoServerRoute;

export type DownloadClientResponse = ClientResponse<DownloadTodoRoute>;
export type DownloadRouteQueryData = RouteQueryData<DownloadTodoRoute>;

const fetchCreateBuilder = fetchRoute
	.post("/server-first/todos")
	.body(schemaType<{ title: string }>());

export const fetchServerFirstRoutes = {
	todos: {
		create: fetchCreateBuilder.handler(({ body: { title } }) => ({
			status: 201 as const,
			body: { id: "todo-1", title },
		})),
	},
};

export const nodeServerFirstRoutes = {
	todos: {
		get: nodeRoute
			.get("/server-first/todos/:id")
			.params(schemaType<{ id: string }>())
			.handler(({ params: { id } }) =>
				id === "missing"
					? { status: 404 as const, body: { code: "TODO_NOT_FOUND" as const } }
					: { status: 200 as const, body: { id, title: "Todo" } },
			),
	},
};

export const fetchServerFirstHandler = createFetchRouteHandler(
	fetchServerFirstRoutes,
);
export const nodeServerFirstHandler = createNodeRouteHandler(
	nodeServerFirstRoutes,
);

type ServerFirstCreateImplementation =
	typeof fetchServerFirstRoutes.todos.create;

export type ServerFirstHandlerRequest = Parameters<
	Parameters<typeof fetchCreateBuilder.handler>[0]
>[0];
export type ServerFirstHandlerResponse =
	InferredRouteResponse<ServerFirstCreateImplementation>;
export type FetchServerFirstHandler = typeof fetchServerFirstHandler;
export type NodeServerFirstHandler = typeof nodeServerFirstHandler;

export const shorthandHoverApi = {
	todos: {
		get: route.output(schemaType<{ id: string; title: string }>()),
		create: route
			.input(schemaType<{ title: string }>())
			.output(schemaType<{ id: string; title: string }>()),
	},
};

export const shorthandHoverClient = initClient(shorthandHoverApi, {
	baseUrl: "https://example.test",
});
export const shorthandHoverQuery = createTanstackQueryHelpers(
	shorthandHoverApi,
	{
		baseUrl: "https://example.test",
	},
);

type ShorthandGetRoute = typeof shorthandHoverApi.todos.get;
type ShorthandCreateRoute = typeof shorthandHoverApi.todos.create;

export type ShorthandGetClientRequest = ClientRequest<ShorthandGetRoute>;
export type ShorthandCreateClientRequest = ClientRequest<ShorthandCreateRoute>;
export type ShorthandGetClientResponse = ClientResponse<ShorthandGetRoute>;
export type ShorthandGetCallParameters = Parameters<
	typeof shorthandHoverClient.todos.get
>;
export type ShorthandGetCallReturn = ReturnType<
	typeof shorthandHoverClient.todos.get
>;
export type ShorthandCreateCallParameters = Parameters<
	typeof shorthandHoverClient.todos.create
>;
export type ShorthandCreateCallReturn = ReturnType<
	typeof shorthandHoverClient.todos.create
>;
export type ShorthandQueryData = RouteQueryData<ShorthandGetRoute>;
export type ShorthandQueryError = RouteQueryError<ShorthandGetRoute>;
export type ShorthandMutationVariables =
	RouteMutationVariables<ShorthandCreateRoute>;
export type ShorthandQueryOptionsParameters = Parameters<
	typeof shorthandHoverQuery.todos.get.queryOptions
>;
export type ShorthandMutationOptionsParameters = Parameters<
	typeof shorthandHoverQuery.todos.create.mutationOptions
>;
