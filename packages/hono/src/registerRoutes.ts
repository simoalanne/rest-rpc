import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	type ImplementationTree,
	splitRouteImplementations,
} from "@rest-rpc/server";
import type { Hono } from "hono";
import type { Env } from "hono/types";
import {
	type ExtendedHonoMiddleware,
	type HonoBodyParser,
	type RequestValidationErrorHandler,
	type ResponseValidationErrorHandler,
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
	requestValidationErrorHandler?: RequestValidationErrorHandler<TEnv>;
	responseValidationErrorHandler?: ResponseValidationErrorHandler<TEnv>;
	middleware?: ExtendedHonoMiddleware<TEnv>[];
	bodyParser?: HonoBodyParser;
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
	return splitRouteImplementations(implementations, {
		handleHttpRoutes: (httpRoutes) =>
			registerHonoHttpRoutes(
				app,
				httpRoutes,
				options.bodyParser,
				options.middleware,
				options.requestValidationErrorHandler,
				options.responseValidationErrorHandler,
			),
		handleWebSocketRoutes: (webSocketRoutes) =>
			options.webSocket &&
			registerHonoWebSocketRoutes(
				app,
				options.webSocket,
				webSocketRoutes,
				options.middleware,
			),
	});
}
