import type { IncomingMessage } from "node:http";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree, ServerErrorHandlers } from "@rest-rpc/server";
import { splitRouteImplementations } from "@rest-rpc/server";
import type { IRouter, Request } from "express";
import {
	type ExtendedExpressMiddleware,
	registerExpressHttpRoutes,
} from "./http.ts";
import {
	type ExpressWebSocketOptions,
	registerExpressWebSocketRoutes,
} from "./websocket.ts";

type ExpressHttpErrorContext = {
	kind: "http";
	req: Request;
	signal: AbortSignal;
};

type ExpressWebSocketErrorContext = {
	kind: "websocket";
	req: IncomingMessage;
	signal: AbortSignal;
};

export type ExpressErrorContext =
	| ExpressHttpErrorContext
	| ExpressWebSocketErrorContext;

/**
 * Options for registering rest-rpc routes on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#options}
 */
export type RegisterRoutesOptions = {
	errorHandlers?: ServerErrorHandlers<ExpressErrorContext>;
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
				options.errorHandlers,
			),
		handleWebSocketRoutes: (webSocketRoutes) =>
			options.webSocket &&
			registerExpressWebSocketRoutes(
				options.webSocket,
				webSocketRoutes,
				options.errorHandlers,
			),
	});
}
