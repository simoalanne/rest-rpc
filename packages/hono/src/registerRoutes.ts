import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import {
	flattenAndSortImplementationTree,
	type ImplementationTree,
	type RouteImplementation,
} from "@contract-first-api/server";
import type { Env } from "hono/types";
import { registerHonoHttpRoutes } from "./http.ts";
import type {
	HonoApp,
	HonoParseBody,
	HonoWebSocketRegistration,
} from "./types.ts";
import { registerHonoWebSocketRoutes } from "./websocket.ts";

const isHttpRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<HttpRouteDeclaration> =>
	"responses" in implementation.route;

const isWebSocketRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<WebSocketRouteDeclaration> =>
	implementation.route.options?.mode === "websocket";

export type RegisterRoutesOptions<TEnv extends Env = Env> = {
	parseBody?: HonoParseBody<TEnv>;
	webSocket?: HonoWebSocketRegistration<TEnv>;
};

export const registerRoutes = <TEnv extends Env = Env>(
	app: HonoApp<TEnv>,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions<TEnv> = {},
) => {
	const implementationsList = flattenAndSortImplementationTree(implementations);
	const routes = implementationsList.filter(isHttpRouteImplementation);
	const webSocketRoutes = implementationsList.filter(
		isWebSocketRouteImplementation,
	);

	registerHonoHttpRoutes(app, routes, options.parseBody);

	if (options.webSocket) {
		registerHonoWebSocketRoutes(app, options.webSocket, webSocketRoutes);
	}
};
