import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree, ServerErrorHandlers } from "@rest-rpc/server";
import { registerRouteImplementations } from "@rest-rpc/server";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { registerFastifyHttpRoutes } from "./http.ts";
import {
	type FastifyWebSocketOptions,
	registerFastifyWebSocketRoutes,
} from "./websocket.ts";

export type RegisterRoutesOptions = {
	errorHandlers?: ServerErrorHandlers<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>;
	webSocket?: FastifyWebSocketOptions;
};

export const registerRoutes = (
	app: FastifyInstance,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions = {},
) =>
	registerRouteImplementations(
		implementations,
		(routes) => registerFastifyHttpRoutes(app, routes, options.errorHandlers),
		(routes) =>
			options.webSocket &&
			registerFastifyWebSocketRoutes(
				app,
				{
					...options.webSocket,
					errorHandlers:
						options.webSocket.errorHandlers ?? options.errorHandlers,
				},
				routes,
			),
	);
