import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree } from "@rest-rpc/server";
import { registerRouteImplementations } from "@rest-rpc/server";
import type { Application } from "express";
import { registerExpressHttpRoutes } from "./http.ts";
import {
	type ExpressWebSocketOptions,
	registerExpressWebSocketRoutes,
} from "./websocket.ts";

type RegisterRoutesOptions = { webSocket?: ExpressWebSocketOptions };

export const registerRoutes = (
	app: Application,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions = {},
) =>
	registerRouteImplementations(
		implementations,
		(routes) => registerExpressHttpRoutes(app, routes),
		(routes) =>
			options.webSocket &&
			registerExpressWebSocketRoutes(options.webSocket, routes),
	);
