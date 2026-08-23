import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type CreateWebHandlerOptions,
	createRouteHandler as createWebRouteHandler,
	type WebContract,
	type WebImplementationTree,
	type WebRouteBuilder,
	type RouteHandlers as WebRouteHandlers,
	type WebRouteMiddleware,
	type WebRouteParseBodyInput,
	type RouteRequest as WebRouteRequest,
	type RouteResponse as WebRouteResponse,
	type WebRouterBuilder,
	route as webRoute,
	router as webRouter,
} from "@rest-rpc/web";
import type { NextRequest } from "next/server.js";

/**
 * Middleware function shape for Next.js route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#framework-context}
 */
export type NextRouteMiddleware<TContext extends Record<string, unknown>> =
	WebRouteMiddleware<Record<never, never>, TContext, NextRequest>;

/**
 * Infers the Next.js route handler request type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> = WebRouteRequest<E, TContext, NextRequest>;

/**
 * Infers the explicit response union for a Next.js HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteResponse<E extends HttpRouteDeclaration> = WebRouteResponse<E>;

/**
 * Handler tree accepted by `router().handlers()` when building a Next.js implementation tree.
 *
 * @remarks Use this type with `implements` to check class-based route handler
 * services against a contract tree.
 *
 * @example
 * ```ts
 * class TodoHandlers implements RouteHandlers<typeof api.todos> {
 *   get(request: RouteRequest<typeof api.todos.get>) {
 *     return { id: request.id };
 *   }
 * }
 * ```
 *
 * @see {@link https://rest-rpc.dev/docs/recipes/class-handlers}
 */
export type RouteHandlers<
	TContract extends WebContract,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> = WebRouteHandlers<TContract, TContext, NextRequest>;

/**
 * Options for creating Next.js route handler exports.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#options}
 */
export type CreateRouteHandlerOptions = {
	errorHandlers?: CreateWebHandlerOptions["errorHandlers"];
	parseBody?: (input: WebRouteParseBodyInput) => unknown | Promise<unknown>;
};

/**
 * Creates a Next.js route implementation builder for a single HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#single-route-handler}
 */
export function route<const TRoute extends HttpRouteDeclaration>(
	contract: TRoute,
): WebRouteBuilder<TRoute, Record<never, never>, NextRequest> {
	return webRoute<TRoute, Record<never, never>, NextRequest>(contract);
}

/**
 * Creates a Next.js router implementation builder for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#catch-all-route-handler}
 */
export function router<const TContract extends WebContract>(
	contract: TContract,
): WebRouterBuilder<TContract, Record<never, never>, NextRequest> {
	return webRouter<TContract, Record<never, never>, NextRequest>(contract);
}

/**
 * Creates Next.js route handler exports from route implementations.
 *
 * @remarks This wrapper passes only the `NextRequest`; use `@rest-rpc/web` directly for custom runtime context.
 * @see {@link https://rest-rpc.dev/docs/server/next.js#custom-runtime-context}
 */
export function createRouteHandler(
	implementations: WebImplementationTree,
	options?: CreateRouteHandlerOptions,
) {
	const handle = createWebRouteHandler(implementations, {
		errorHandlers: options?.errorHandlers,
		parseBody: options?.parseBody,
	});
	const nextHandler = (request: Request) => handle(request, {});

	return {
		DELETE: nextHandler,
		GET: nextHandler,
		PATCH: nextHandler,
		POST: nextHandler,
		PUT: nextHandler,
	};
}
