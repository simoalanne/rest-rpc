import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	flattenAndSortImplementationTree,
	type ImplementationTree,
	type RouteImplementation,
} from "@rest-rpc/server";
import type { Application } from "express";
import { registerExpressHttpRoutes } from "./http.ts";
import {
	type ExpressWebSocketRegistration,
	registerExpressWebSocketRoutes,
} from "./websocket.ts";

const isHttpRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<HttpRouteDeclaration> =>
	"responses" in implementation.route;

const isWebSocketRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<WebSocketRouteDeclaration> =>
	implementation.route.options?.mode === "websocket";

export type RegisterRoutesOptions = {
	webSocket?: ExpressWebSocketRegistration;
};

export const registerRoutes = (
	app: Application,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions = {},
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
