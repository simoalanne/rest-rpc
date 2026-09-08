import { createFetchResponse, defaultBodyParser } from "@rest-rpc/fetch";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type RouteImplementation,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";
import type { Context, Hono, HonoRequest, Next } from "hono";
import type { Env } from "hono/types";

/** Handles an HTTP request validation error using native Hono arguments. */
export type RequestValidationErrorHandler<TEnv extends Env = Env> = (
	error: RequestValidationError,
	c: Context<TEnv>,
) => Response | Promise<Response>;

/** Handles an HTTP response validation error using native Hono arguments. */
export type ResponseValidationErrorHandler<TEnv extends Env = Env> = (
	error: ResponseValidationError,
	c: Context<TEnv>,
) => Response | Promise<Response>;

/**
 * Custom Hono request body parser used during route registration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#body-parsing}
 */
export type HonoBodyParser = (
	request: HonoRequest,
) => unknown | Promise<unknown>;

/**
 * Hono middleware that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#middleware}
 */
export type ExtendedHonoMiddleware<TEnv extends Env = Env> = (
	c: Context<TEnv>,
	next: Next,
	route: RouteDeclaration,
	// oxlint-disable-next-line typescript/no-explicit-any -- Hono itself accepts `any` for handler return type.
) => Promise<any> | any;

export const registerHonoHttpRoutes = <TEnv extends Env = Env>(
	app: Hono<TEnv>,
	routes: RouteImplementation<ServerHttpRouteDeclaration>[],
	bodyParser: HonoBodyParser | undefined = undefined,
	middleware: ExtendedHonoMiddleware<TEnv>[] = [],
	requestValidationErrorHandler?: RequestValidationErrorHandler<TEnv>,
	responseValidationErrorHandler?: ResponseValidationErrorHandler<TEnv>,
) => {
	const usesDefaultBodyParser = bodyParser === undefined;

	for (const implementation of routes) {
		const route: ServerHttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<
			ServerHttpRouteDeclaration["method"]
		>;

		app[method](
			// oxlint-disable-next-line typescript/no-explicit-any -- Hono's typings are too strict for this case.
			toColonPath(route.path) as any,
			...middleware.map(
				(mw) => (c: Context<TEnv>, next: Next) => mw(c, next, route),
			),
			async (c: Context<TEnv>) => {
				let body: unknown;
				try {
					body = bodyParser
						? await bodyParser(c.req)
						: await defaultBodyParser(c.req.raw);
				} catch (error) {
					if (!usesDefaultBodyParser) throw error;
					return c.json({ message: "Invalid request body" }, 400);
				}

				try {
					const result = await handleHttpRoute(route, implementation.handler, {
						request: {
							body,
							query: c.req.query(),
							params: c.req.param(),
							headers: c.req.header(),
						},
						context: { c, signal: c.req.raw.signal },
					});

					return createFetchResponse(result);
				} catch (error) {
					if (error instanceof RequestValidationError) {
						if (requestValidationErrorHandler) {
							return requestValidationErrorHandler(error, c);
						}

						return c.json(
							{
								message:
									"Request validation failed. Check the validationErrors field for details.",
								validationErrors: error.issues,
							},
							400,
						);
					}

					if (error instanceof ResponseValidationError) {
						if (responseValidationErrorHandler) {
							return responseValidationErrorHandler(error, c);
						}

						return c.json({ message: "Response validation failed." }, 500);
					}

					throw error;
				}
			},
		);
	}
};
