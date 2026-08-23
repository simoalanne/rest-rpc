import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree, ServerErrorHandlers } from "@rest-rpc/server";
import { registerRouteImplementations } from "@rest-rpc/server";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
	type ExtendedFastifyPreHandler,
	registerFastifyHttpRoutes,
} from "./http.ts";
import {
	type FastifyWebSocketOptions,
	registerFastifyWebSocketRoutes,
} from "./websocket.ts";

export type RegisterRoutesOptions = {
	errorHandlers?: ServerErrorHandlers<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>;
	preHandler?: ExtendedFastifyPreHandler[];
	webSocket?: FastifyWebSocketOptions;
};

export function registerRoutes(
	app: FastifyInstance,
	implementations: ImplementationTree<RouteDeclaration>,
	options: RegisterRoutesOptions = {},
) {
	return registerRouteImplementations(
		implementations,
		(routes) =>
			registerFastifyHttpRoutes(
				app,
				routes,
				options.preHandler,
				options.errorHandlers,
			),
		(routes) =>
			options.webSocket &&
			registerFastifyWebSocketRoutes(
				app,
				options.webSocket,
				routes,
				options.preHandler,
				options.errorHandlers,
			),
	);
}
