// This verifies that declarations exported by downstream packages can name all
// public server-first builder, implementation, handler, and client types.

import {
	initServerFirstClient,
	route as contractRoute,
	type as schemaType,
} from "@rest-rpc/core";
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

export const unfinishedFetchBuilder = fetchRoute.post("/todos").body(todoInput);
export const unfinishedNodeBuilder = nodeRoute
	.post("/node-todos")
	.body(todoInput);

export const fetchRoutes = {
	create: unfinishedFetchBuilder.handler(({ title }) => ({
		status: 201 as const,
		body: { id: "todo-1", title },
	})),
	health: implementFetch(contractRoute.get("/health").response(204)).handler(
		() => undefined,
	),
};

export const nodeRoutes = {
	create: unfinishedNodeBuilder.handler(({ title }) => ({
		status: 201 as const,
		body: { id: "todo-1", title },
	})),
	health: implementNode(
		contractRoute.get("/node-health").response(204),
	).handler(() => undefined),
};

export const fetchHandler = createFetchRouteHandler(fetchRoutes);
export const nodeHandler = createNodeRouteHandler(nodeRoutes);
export const fetchClient = initServerFirstClient<typeof fetchRoutes>({
	baseUrl: "http://localhost",
});
export const nodeClient = initServerFirstClient<typeof nodeRoutes>({
	baseUrl: "http://localhost",
});
