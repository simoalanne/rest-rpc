import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	type ImplementationTree,
	registerRouteImplementations,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { Context, Hono } from "hono";
import type { Env } from "hono/types";
import {
	type ExtendedHonoMiddleware,
	type HonoParseBody,
	registerHonoHttpRoutes,
} from "./http.ts";
import {
	type HonoWebSocketOptions,
	registerHonoWebSocketRoutes,
} from "./websocket.ts";

/**
 * Options for registering rest-rpc routes on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#options}
 */
export type RegisterRoutesOptions<TEnv extends Env = Env> = {
	errorHandlers?: ServerErrorHandlers<{
		c: Context<TEnv>;
		signal: AbortSignal;
	}>;
	middleware?: ExtendedHonoMiddleware<TEnv>[];
	parseBody?: HonoParseBody<TEnv>;
	webSocket?: HonoWebSocketOptions<TEnv>;
};

/**
 * Registers HTTP and WebSocket route implementations on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function registerRoutes<TEnv extends Env = Env>(
	app: Hono<TEnv>,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions<TEnv> = {},
) {
	return registerRouteImplementations(
		implementations,
		(routes) =>
			registerHonoHttpRoutes(
				app,
				routes,
				options.parseBody,
				options.middleware,
				options.errorHandlers,
			),
		(routes) => {
			if (options.webSocket) {
				registerHonoWebSocketRoutes(
					app,
					options.webSocket,
					routes,
					options.middleware,
					options.errorHandlers,
				);
			}
		},
	);
}
