import {
	type CreateFetchHandlerOptions,
	createRouteHandler as createFetchRouteHandler,
	type FetchContract,
	type FetchImplementationTree,
	type FetchRouteBuilder,
	type RouteHandlers as FetchRouteHandlers,
	type FetchRouteMiddleware,
	type FetchRouteParseBodyInput,
	type RouteRequest as FetchRouteRequest,
	type RouteResponse as FetchRouteResponse,
	type ServerHttpRouteDeclaration,
	type FetchRouterBuilder,
	route as fetchRoute,
	router as fetchRouter,
} from "@rest-rpc/fetch";
import type { NextRequest } from "next/server.js";

/**
 * Middleware function shape for Next.js route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#framework-context}
 */
export type NextRouteMiddleware<TContext extends Record<string, unknown>> =
	FetchRouteMiddleware<Record<never, never>, TContext, NextRequest>;

/**
 * Infers the Next.js route handler request type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	E extends ServerHttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> = FetchRouteRequest<E, TContext, NextRequest>;

/**
 * Infers the explicit response union for a Next.js HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteResponse<E extends ServerHttpRouteDeclaration> =
	FetchRouteResponse<E>;

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
 * @see {@link https://rest-rpc.dev/docs/recipes/organizing-route-handlers#service-classes-as-handlers}
 */
export type RouteHandlers<
	TContract extends FetchContract,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> = FetchRouteHandlers<TContract, TContext, NextRequest>;

/**
 * Options for creating Next.js route handler exports.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#options}
 */
export type CreateRouteHandlerOptions = {
	errorHandlers?: CreateFetchHandlerOptions["errorHandlers"];
	parseBody?: (input: FetchRouteParseBodyInput) => unknown | Promise<unknown>;
};

/**
 * Creates a Next.js route implementation builder for a single HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#single-route-handler}
 */
export function route<const TRoute extends ServerHttpRouteDeclaration>(
	contract: TRoute,
): FetchRouteBuilder<TRoute, Record<never, never>, NextRequest> {
	return fetchRoute<TRoute, Record<never, never>, NextRequest>(contract);
}

/**
 * Creates a Next.js router implementation builder for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/next.js#catch-all-route-handler}
 */
export function router<const TContract extends FetchContract>(
	contract: TContract,
): FetchRouterBuilder<TContract, Record<never, never>, NextRequest> {
	return fetchRouter<TContract, Record<never, never>, NextRequest>(contract);
}

/**
 * Creates Next.js route handler exports from route implementations.
 *
 * @remarks This wrapper passes only the `NextRequest`; use `@rest-rpc/fetch` directly for custom runtime context.
 * @see {@link https://rest-rpc.dev/docs/server/next.js#custom-runtime-context}
 */
export function createRouteHandler(
	implementations: FetchImplementationTree,
	options?: CreateRouteHandlerOptions,
) {
	const handle = createFetchRouteHandler(implementations, {
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
