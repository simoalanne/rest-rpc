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

/**
 * Options for registering rest-rpc routes on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#options}
 */
export type RegisterRoutesOptions = {
	errorHandlers?: ServerErrorHandlers<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>;
	preHandler?: ExtendedFastifyPreHandler[];
	webSocket?: FastifyWebSocketOptions;
};

/**
 * Registers HTTP and WebSocket route implementations on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify}
 */
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
