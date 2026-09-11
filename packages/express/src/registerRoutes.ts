import type { ImplementationTree } from "@rest-rpc/server";
import { flattenRouteImplementations } from "@rest-rpc/server";
import type { IRouter } from "express";
import {
	type ExtendedExpressMiddleware,
	type RequestValidationErrorHandler,
	type ResponseValidationErrorHandler,
	registerExpressHttpRoutes,
} from "./http.ts";

/**
 * Options for registering rest-rpc routes on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#options}
 */
export type RegisterRoutesOptions = {
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
	middleware?: ExtendedExpressMiddleware[];
};

/**
 * Registers HTTP route implementations on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express}
 */
export function registerRoutes(
	app: IRouter,
	implementations: ImplementationTree,
	options: RegisterRoutesOptions = {},
) {
	return registerExpressHttpRoutes(
		app,
		flattenRouteImplementations(implementations),
		options.middleware,
		options.requestValidationErrorHandler,
		options.responseValidationErrorHandler,
	);
}
