import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree } from "@rest-rpc/server";
import { splitRouteImplementations } from "@rest-rpc/server";
import type { IRouter } from "express";
import {
	type ExtendedExpressMiddleware,
	type RequestValidationErrorHandler,
	type ResponseValidationErrorHandler,
	registerExpressHttpRoutes,
} from "./http.ts";
import {
	type ExpressWebSocketOptions,
	registerExpressWebSocketRoutes,
} from "./websocket.ts";

/**
 * Options for registering rest-rpc routes on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#options}
 */
export type RegisterRoutesOptions = {
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
	middleware?: ExtendedExpressMiddleware[];
	webSocket?: ExpressWebSocketOptions;
};

/**
 * Registers HTTP and WebSocket route implementations on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express}
 */
export function registerRoutes(
	app: IRouter,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions = {},
) {
	return splitRouteImplementations(implementations, {
		handleHttpRoutes: (httpRoutes) =>
			registerExpressHttpRoutes(
				app,
				httpRoutes,
				options.middleware,
				options.requestValidationErrorHandler,
				options.responseValidationErrorHandler,
			),
		handleWebSocketRoutes: (webSocketRoutes) =>
			options.webSocket &&
			registerExpressWebSocketRoutes(options.webSocket, webSocketRoutes),
	});
}
