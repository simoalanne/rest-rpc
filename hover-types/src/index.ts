import { initClient, route, type as schemaType } from "@rest-rpc/core";
import type {
	ClientRequest,
	ClientResponse,
	ClientResponseBody,
} from "@rest-rpc/core";
import { route as expressRoute } from "@rest-rpc/express";
import {
	createRouteHandler as createFetchRouteHandler,
	route as fetchRoute,
} from "@rest-rpc/fetch";
import type {
	RouteErrors,
	RouteHandler,
	RouteRequest,
	RouteRequestData,
	RouteResponse,
	RouteResponseShorthand,
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
			.jsonQuery(
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
			.response(201, {
				body: schemaType<{ id: string; title: string }>(),
				headers: schemaType<{ location: string; "x-next-cursor"?: string }>(),
			})
			.response(400, schemaType<{ code: "INVALID_TODO" }>()),
		download: route
			.get("/todos/:id/export")
			.params(schemaType<{ id: string }>())
			.customResponse(200, {
				schema: schemaType<Uint8Array>(),
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
		sse: route
			.sse("/todos/sse")
			.response(schemaType<{ id: string; message: string }>()),
		ws: route
			.ws("/todos/ws")
			.clientMessage("message", schemaType<{ id: string; message: string }>()),
	},
};

export const hoverClient = initClient(hoverApi, {
	baseUrl: "https://example.test",
});

export const strictHoverClient = initClient(hoverApi, {
	baseUrl: "https://example.test",
});

export const hoverQuery = createTanstackQueryHelpers(hoverApi, {
	baseUrl: "https://example.test",
});

export const strictHoverQuery = createTanstackQueryHelpers(hoverApi, {
	baseUrl: "https://example.test",
});

export const createTodoServerRoute = expressRoute(
	hoverApi.todos.create,
	({ title }) => ({
		status: 201,
		body: { id: "todo-1", title },
		responseHeaders: { location: "/todos/todo-1" },
	}),
);

export const createTodoFetchPromise = hoverClient.todos.create.fetch({
	title: "Write hover tests",
});

export const createTodoFetchResponsePromise =
	hoverClient.todos.create.fetchResponse({
		title: "Write hover tests",
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
	id: "todo-1",
	includeDone: false,
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

export type GetClientRequest = ClientRequest<GetTodoRoute>;
export type CreateClientRequest = ClientRequest<CreateTodoRoute>;
export type PageClientRequest = ClientRequest<PageTodoRoute>;
export type RemoveClientRequest = ClientRequest<RemoveTodoRoute>;

export type CreateClientResponse = ClientResponse<CreateTodoRoute>;
export type CreateStrictClientResponse = ClientResponse<CreateTodoRoute>;
export type CreateClientResponseBody = ClientResponseBody<CreateTodoRoute>;

export type CreateFetchParameters = Parameters<
	typeof hoverClient.todos.create.fetch
>;
export type CreateFetchReturn = ReturnType<
	typeof hoverClient.todos.create.fetch
>;
export type CreateFetchResponseParameters = Parameters<
	typeof hoverClient.todos.create.fetchResponse
>;
export type CreateFetchResponseReturn = ReturnType<
	typeof hoverClient.todos.create.fetchResponse
>;
export type StrictCreateFetchResponseReturn = ReturnType<
	typeof strictHoverClient.todos.create.fetchResponse
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
export type CreateStrictRouteQueryError = RouteQueryError<CreateTodoRoute>;
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
export type CreateExpressRouteResponseShorthand =
	RouteResponseShorthand<CreateTodoRoute>;
export type CreateExpressRouteErrors = RouteErrors<CreateTodoRoute>;
export type CreateExpressRouteImplementation = typeof createTodoServerRoute;

export type DownloadClientResponse = ClientResponse<DownloadTodoRoute>;
export type DownloadRouteQueryData = RouteQueryData<DownloadTodoRoute>;
export type EventsClientResponseBody = ClientResponseBody<EventsRoute>;
export type RemoveClientResponseBody = ClientResponseBody<RemoveTodoRoute>;

export const fetchServerFirstRoutes = {
	todos: {
		create: fetchRoute
			.post("/server-first/todos")
			.body(schemaType<{ title: string }>())
			.handler(({ title }) => ({
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
			.handler(({ id }) =>
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

export const serverFirstClient = initClient<typeof fetchServerFirstRoutes>({
	baseUrl: "https://example.test",
});

export const serverFirstCreatePromise = serverFirstClient
	.post("/server-first/todos")
	.fetch({ body: { title: "Write hover tests" } });

type ServerFirstCreateImplementation =
	typeof fetchServerFirstRoutes.todos.create;
type ServerFirstCreateClientRoute = ReturnType<
	typeof serverFirstClient.post<"/server-first/todos">
>;

export type ServerFirstHandlerRequest = Parameters<
	ServerFirstCreateImplementation["handler"]
>[0];
export type ServerFirstHandlerResponse = ReturnType<
	ServerFirstCreateImplementation["handler"]
>;
export type ServerFirstClientFetchParameters = Parameters<
	ServerFirstCreateClientRoute["fetch"]
>;
export type ServerFirstClientFetchReturn = ReturnType<
	ServerFirstCreateClientRoute["fetch"]
>;
export type ServerFirstClientFetchResponseReturn = ReturnType<
	ServerFirstCreateClientRoute["fetchResponse"]
>;
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
	{ baseUrl: "https://example.test" },
);

type ShorthandGetRoute = typeof shorthandHoverApi.todos.get;
type ShorthandCreateRoute = typeof shorthandHoverApi.todos.create;

export type ShorthandGetClientRequest = ClientRequest<ShorthandGetRoute>;
export type ShorthandCreateClientRequest = ClientRequest<ShorthandCreateRoute>;
export type ShorthandGetClientResponse = ClientResponse<ShorthandGetRoute>;
export type ShorthandGetClientResponseBody =
	ClientResponseBody<ShorthandGetRoute>;
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

export const shorthandServerFirstRoutes = {
	todos: {
		inferred: fetchRoute.handler(() => ({
			id: "todo-1" as const,
			title: "Todo" as const,
		})),
		declared: fetchRoute
			.output(schemaType<{ id: string; title: string }>())
			.handler(() => ({ id: "todo-1", title: "Todo" })),
		explicit: fetchRoute
			.get("/server-first/explicit")
			.handler(() => ({ status: 204 as const })),
	},
	explicitOnly: {
		health: fetchRoute
			.get("/server-first/health")
			.handler(() => ({ status: 204 as const })),
	},
};

export const shorthandServerFirstClient = initClient<
	typeof shorthandServerFirstRoutes
>({ baseUrl: "https://example.test" });
export const shorthandServerFirstQuery = createTanstackQueryHelpers<
	typeof shorthandServerFirstRoutes
>({ baseUrl: "https://example.test" });

export type ServerFirstInferredShorthandReturn = ReturnType<
	typeof shorthandServerFirstClient.todos.inferred
>;
export type ServerFirstDeclaredShorthandReturn = ReturnType<
	typeof shorthandServerFirstClient.todos.declared
>;
export type ServerFirstShorthandNamespaceKeys =
	keyof typeof shorthandServerFirstClient.todos;
export type ServerFirstHasExplicitOnlyNamespace =
	"explicitOnly" extends keyof typeof shorthandServerFirstClient ? true : false;
export type ServerFirstTanstackShorthandNamespaceKeys =
	keyof typeof shorthandServerFirstQuery.todos;
export type ServerFirstTanstackHasExplicitOnlyNamespace =
	"explicitOnly" extends keyof typeof shorthandServerFirstQuery ? true : false;
