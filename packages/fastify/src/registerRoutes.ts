import type { ImplementationTree } from "@rest-rpc/server";
import { flattenRouteImplementations } from "@rest-rpc/server";
import type { FastifyInstance } from "fastify";
import {
	type ExtendedFastifyPreHandler,
	type RequestValidationErrorHandler,
	type ResponseValidationErrorHandler,
	registerFastifyHttpRoutes,
} from "./http.ts";

/**
 * Options for registering rest-rpc routes on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#options}
 */
export type RegisterRoutesOptions = {
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
	preHandler?: ExtendedFastifyPreHandler[];
};

/**
 * Registers HTTP route implementations on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify}
 */
export function registerRoutes(
	app: FastifyInstance,
	implementations: ImplementationTree,
	options: RegisterRoutesOptions = {},
) {
	return registerFastifyHttpRoutes(
		app,
		flattenRouteImplementations(implementations),
		options.preHandler,
		options.requestValidationErrorHandler,
		options.responseValidationErrorHandler,
	);
}
