import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree, ServerErrorHandlers } from "@rest-rpc/server";
import { splitRouteImplementations } from "@rest-rpc/server";
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
	return splitRouteImplementations(implementations, {
		handleHttpRoutes: (httpRoutes) =>
			registerFastifyHttpRoutes(
				app,
				httpRoutes,
				options.preHandler,
				options.errorHandlers,
			),
		handleWebSocketRoutes: (webSocketRoutes) =>
			options.webSocket &&
			registerFastifyWebSocketRoutes(
				app,
				options.webSocket,
				webSocketRoutes,
				options.preHandler,
				options.errorHandlers,
			),
	});
}
