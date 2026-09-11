import {
	type ImplementationTree,
	flattenRouteImplementations,
} from "@rest-rpc/server";
import type { Hono } from "hono";
import type { Env } from "hono/types";
import {
	type ExtendedHonoMiddleware,
	type HonoBodyParser,
	type RequestValidationErrorHandler,
	type ResponseValidationErrorHandler,
	registerHonoHttpRoutes,
} from "./http.ts";

/**
 * Options for registering rest-rpc routes on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#options}
 */
export type RegisterRoutesOptions<TEnv extends Env = Env> = {
	requestValidationErrorHandler?: RequestValidationErrorHandler<TEnv>;
	responseValidationErrorHandler?: ResponseValidationErrorHandler<TEnv>;
	middleware?: ExtendedHonoMiddleware<TEnv>[];
	bodyParser?: HonoBodyParser;
};

/**
 * Registers HTTP route implementations on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function registerRoutes<TEnv extends Env = Env>(
	app: Hono<TEnv>,
	implementations: ImplementationTree,
	options: RegisterRoutesOptions<TEnv> = {},
) {
	return registerHonoHttpRoutes(
		app,
		flattenRouteImplementations(implementations),
		options.bodyParser,
		options.middleware,
		options.requestValidationErrorHandler,
		options.responseValidationErrorHandler,
	);
}
