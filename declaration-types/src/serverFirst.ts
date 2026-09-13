// This verifies that declarations exported by downstream packages can name all
// public server-first builder, implementation, handler, and client types.

import {
	initClient,
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
const todoOutput = schemaType<{ id: string; title: string }>();

export const fetchShorthandInputBuilder = fetchRoute.input(todoInput);
export const fetchShorthandOutputBuilder = fetchRoute.output(todoOutput);
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
export const fetchShorthandClient = initClient<
	typeof fetchShorthandImplementations
>({
	baseUrl: "http://localhost",
});

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
export const fetchClient = initClient<typeof fetchRoutes>({
	baseUrl: "http://localhost",
});
export const nodeClient = initClient<typeof nodeRoutes>({
	baseUrl: "http://localhost",
});
