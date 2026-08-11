import type { IncomingMessage } from "node:http";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree, ServerErrorHandlers } from "@rest-rpc/server";
import { registerRouteImplementations } from "@rest-rpc/server";
import type { Application, Request } from "express";
import { registerExpressHttpRoutes } from "./http.ts";
import {
	type ExpressWebSocketOptions,
	registerExpressWebSocketRoutes,
} from "./websocket.ts";

export type RegisterRoutesOptions = {
	errorHandlers?: ServerErrorHandlers<
		{ kind: "http"; req: Request } | { kind: "websocket"; req: IncomingMessage }
	>;
	webSocket?: ExpressWebSocketOptions;
};

export const registerRoutes = (
	app: Application,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions = {},
) =>
	registerRouteImplementations(
		implementations,
		(routes) => registerExpressHttpRoutes(app, routes, options.errorHandlers),
		(routes) =>
			options.webSocket &&
			registerExpressWebSocketRoutes(
				options.webSocket,
				routes,
				options.errorHandlers,
			),
	);
