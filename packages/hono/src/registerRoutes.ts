import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	type ImplementationTree,
	registerRouteImplementations,
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
) =>
	registerRouteImplementations(
		implementations,
		(routes) => registerHonoHttpRoutes(app, routes, options.parseBody),
		(routes) => {
			if (options.webSocket) {
				registerHonoWebSocketRoutes(app, options.webSocket, routes);
			}
		},
	);
