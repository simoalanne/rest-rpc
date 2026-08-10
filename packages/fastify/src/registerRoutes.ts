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
import { registerFastifyHttpRoutes } from "./http.ts";
import type { FastifyApp, FastifyWebSocketRegistration } from "./types.ts";
import { registerFastifyWebSocketRoutes } from "./websocket.ts";

const isHttpRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<HttpRouteDeclaration> =>
	"responses" in implementation.route;

const isWebSocketRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<WebSocketRouteDeclaration> =>
	implementation.route.options?.mode === "websocket";

export type RegisterRoutesOptions = {
	webSocket?: FastifyWebSocketRegistration;
};

export const registerRoutes = (
	app: FastifyApp,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions = {},
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
