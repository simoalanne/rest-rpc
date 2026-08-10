import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	flattenAndSortImplementationTree,
	type ImplementationTree,
	isHttpRouteImplementation,
	isWebSocketRouteImplementation,
} from "@rest-rpc/server";
import type { Hono } from "hono";
import type { Env } from "hono/types";
import { type HonoParseBody, registerHonoHttpRoutes } from "./http.ts";
import {
	type HonoWebSocketOptions,
	registerHonoWebSocketRoutes,
} from "./websocket.ts";

export type RegisterRoutesOptions<TEnv extends Env = Env> = {
	parseBody?: HonoParseBody<TEnv>;
	webSocket?: HonoWebSocketOptions<TEnv>;
};

export const registerRoutes = <TEnv extends Env = Env>(
	app: Hono<TEnv>,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions<TEnv> = {},
) => {
	const implementationsList = flattenAndSortImplementationTree(implementations);
	const routes = implementationsList.filter(isHttpRouteImplementation);
	const webSocketRoutes = implementationsList.filter(
		isWebSocketRouteImplementation,
	);

	const internalApp = app as unknown as Hono;

	registerHonoHttpRoutes(
		internalApp,
		routes,
		options.parseBody as HonoParseBody | undefined,
	);

	if (options.webSocket) {
		registerHonoWebSocketRoutes(
			internalApp,
			options.webSocket as unknown as HonoWebSocketOptions,
			webSocketRoutes,
		);
	}
};
