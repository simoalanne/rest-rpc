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

/**
 * Options for registering rest-rpc routes on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#options}
 */
export type RegisterRoutesOptions = {
	errorHandlers?: ServerErrorHandlers<
		| { kind: "http"; req: Request; signal: AbortSignal }
		| { kind: "websocket"; req: IncomingMessage; signal: AbortSignal }
	>;
	middleware?: ExtendedExpressMiddleware[];
	webSocket?: ExpressWebSocketOptions;
};

type ExpressHttpErrorHandlers = ServerErrorHandlers<{
	req: Request;
	signal: AbortSignal;
}>;

type ExpressWebSocketErrorHandlers = ServerErrorHandlers<{
	kind: "websocket";
	req: IncomingMessage;
	signal: AbortSignal;
}>;

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
				options.errorHandlers as ExpressHttpErrorHandlers | undefined,
			),
		handleWebSocketRoutes: (webSocketRoutes) =>
			options.webSocket &&
			registerExpressWebSocketRoutes(
				options.webSocket,
				webSocketRoutes,
				options.errorHandlers as ExpressWebSocketErrorHandlers | undefined,
			),
	});
}
