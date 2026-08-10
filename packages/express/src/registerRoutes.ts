import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	flattenAndSortImplementationTree,
	type ImplementationTree,
	isHttpRouteImplementation,
	isWebSocketRouteImplementation,
} from "@rest-rpc/server";
import type { Application } from "express";
import { registerExpressHttpRoutes } from "./http.ts";
import {
	type ExpressWebSocketOptions,
	registerExpressWebSocketRoutes,
} from "./websocket.ts";

export const registerRoutes = (
	app: Application,
	implementations: ImplementationTree<RouteDeclaration>,
	options: { webSocket?: ExpressWebSocketOptions } = {},
) => {
	const implementationsList = flattenAndSortImplementationTree(implementations);
	const routes = implementationsList.filter(isHttpRouteImplementation);
	const webSocketRoutes = implementationsList.filter(
		isWebSocketRouteImplementation,
	);

	registerExpressHttpRoutes(app, routes);

	if (options.webSocket) {
		registerExpressWebSocketRoutes(options.webSocket, webSocketRoutes);
	}
};
