// This verifies that declarations exported by downstream packages can name all
// public server-first builder, implementation, and handler types.

import {
	type ClientRequest,
	type ClientResponse,
	route as contractRoute,
	type as schemaType,
} from "@rest-rpc/core";
import type {
	RouteRequestData,
	RouteResponse,
	RouteErrors,
} from "@rest-rpc/server";
import {
	createRouteHandler as createFetchRouteHandler,
	implement as implementFetch,
	route as fetchRoute,
} from "@rest-rpc/fetch";
import {
	createRouteHandler as createNodeRouteHandler,
	implement as implementNode,
	route as nodeRoute,
} from "@rest-rpc/node";

const todoInput = schemaType<{ title: string }>();
const todoOutput = schemaType<{ id: string; title: string }>();

export const fetchShorthandInputBuilder = fetchRoute.input(todoInput);
export const fetchShorthandOutputBuilder = fetchRoute.output(todoOutput);
export const fetchShorthandCustomOutputBuilder = fetchRoute.output(todoOutput, {
	contentType: "text/plain",
});
export const fetchShorthandStreamOutputBuilder =
	fetchRoute.streamOutput(todoOutput);
export const fetchShorthandInputOutputBuilder =
	fetchShorthandInputBuilder.output(todoOutput);
export const fetchShorthandOutputInputBuilder =
	fetchShorthandOutputBuilder.input(todoInput);

export const fetchShorthandDeclaredImplementation =
	fetchShorthandOutputBuilder.handler(() => ({
		id: "todo-1",
		title: "Todo",
	}));
export const fetchShorthandInferredImplementation = fetchRoute.handler(() => ({
	id: "todo-2" as const,
}));

export const fetchShorthandImplementations = {
	todos: {
		get: fetchShorthandDeclaredImplementation,
		create: fetchShorthandInputOutputBuilder.handler(({ input }) => ({
			id: "todo-1",
			title: input.title,
		})),
		inferred: fetchShorthandInferredImplementation,
	},
};
export const unfinishedFetchBuilder = fetchRoute.post("/todos").body(todoInput);
export const unfinishedNodeBuilder = nodeRoute
	.post("/node-todos")
	.body(todoInput);

export const fetchRoutes = {
	create: unfinishedFetchBuilder.handler(({ body: { title } }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
	})),
	health: implementFetch(contractRoute.get("/health").response(204)).handler(
		() => ({ status: 204 }),
	),
};

export const nodeRoutes = {
	create: unfinishedNodeBuilder.handler(({ body: { title } }) => ({
		status: 201 as const,
		body: {
			id: "todo-1",
			title,
		},
	})),
	health: implementNode(
		contractRoute.get("/node-health").response(204),
	).handler(() => ({ status: 204 })),
};

export const fetchHandler = createFetchRouteHandler(fetchRoutes);
export const nodeHandler = createNodeRouteHandler(nodeRoutes);

// Downstream packages use public helpers directly on completed routes.
export type CreateClientRequest = ClientRequest<typeof fetchRoutes.create>;
export type CreateClientResponse = ClientResponse<typeof fetchRoutes.create>;
export type CreateServerRequest = RouteRequestData<typeof fetchRoutes.create>;
export type CreateServerResponse = RouteResponse<typeof fetchRoutes.create>;
export type CreateServerErrors = RouteErrors<typeof fetchRoutes.create>;

export const fetchMiddleware = fetchRoute.middleware(({ next }) => next());
export const fetchMiddlewareBase = fetchRoute.use(fetchMiddleware);
export const fetchMiddlewareBuilder = fetchMiddlewareBase
	.get("/middleware")
	.use(async ({ next }) => {
		const output = await next();
		return output;
	});
export const fetchMiddlewareImplementation = fetchMiddlewareBuilder.handler(
	() => ({ status: 200, body: "ok" }),
);
export const nodeMiddleware = nodeRoute.middleware(({ next }) => next());
export const implementedMiddlewareBuilder = implementFetch(
	contractRoute.get("/implemented-middleware").response(204),
).use(fetchMiddleware);
