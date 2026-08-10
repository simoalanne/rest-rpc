import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree } from "@rest-rpc/server";
import { registerRouteImplementations } from "@rest-rpc/server";
import type { FastifyInstance } from "fastify";
import { registerFastifyHttpRoutes } from "./http.ts";
import {
	type FastifyWebSocketOptions,
	registerFastifyWebSocketRoutes,
} from "./websocket.ts";

export const registerRoutes = (
	app: FastifyInstance,
	implementations: ImplementationTree<RouteDeclaration>,
	options: { webSocket?: FastifyWebSocketOptions } = {},
) =>
	registerRouteImplementations(
		implementations,
		(routes) => registerFastifyHttpRoutes(app, routes),
		(routes) =>
			options.webSocket &&
			registerFastifyWebSocketRoutes(app, options.webSocket, routes),
	);
