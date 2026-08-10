import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	flattenAndSortImplementationTree,
	type ImplementationTree,
	isHttpRouteImplementation,
	isWebSocketRouteImplementation,
} from "@rest-rpc/server";
import type { FastifyInstance } from "fastify";
import { registerFastifyHttpRoutes } from "./http.ts";
import {
	type FastifyWebSocketOptions,
	registerFastifyWebSocketRoutes,
} from "./websocket.ts";

export const registerRoutes = (
	app: FastifyInstance,
	implementations: ImplementationTree<RouteDeclaration>,
	options: { webSocket?: FastifyWebSocketOptions } = {},
) => {
	const implementationsList = flattenAndSortImplementationTree(implementations);
	const routes = implementationsList.filter(isHttpRouteImplementation);
	const webSocketRoutes = implementationsList.filter(
		isWebSocketRouteImplementation,
	);

	registerFastifyHttpRoutes(app, routes);

	if (options.webSocket) {
		registerFastifyWebSocketRoutes(app, options.webSocket, webSocketRoutes);
	}
};
