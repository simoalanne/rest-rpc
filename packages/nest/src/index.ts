import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	type ImplementationTreeFor,
	type RouteImplementation,
	type RouteHandler as ServerRouteHandler,
	type RouteHandlers as ServerRouteHandlers,
	type RouteRequest as ServerRouteRequest,
	route as serverRoute,
	router as serverRouter,
} from "@rest-rpc/server";
import type { DefaultNestContext, NestHandlerContext } from "./module.ts";

export type {
	ClearCookieOptions,
	RouteErrors,
	RouteResponse,
	RouteResponseShorthand,
	SetCookieOptions,
} from "@rest-rpc/server";
export { clearCookie, RouteResponseError, setCookie } from "@rest-rpc/server";
export { Route, Router } from "./decorators.ts";
export type {
	DefaultNestContext,
	NestHandlerContext,
	RestRpcModuleOptions,
} from "./module.ts";
export { RestRpcModule } from "./module.ts";

/**
 * A contract tree containing only HTTP routes for the Nest adapter.
 */
export type NestContract = Contract<HttpRouteDeclaration>;

/**
 * Infers the Nest route handler request type for a given route declaration.
 */
export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = DefaultNestContext,
> = ServerRouteRequest<E, NestHandlerContext<TContext>>;

/**
 * Handler tree accepted by `router()` when building a Nest implementation tree.
 */
export type RouteHandlers<
	TContract extends NestContract,
	TContext extends Record<string, unknown> = DefaultNestContext,
> = ServerRouteHandlers<
	TContract,
	NestHandlerContext<TContext>,
	Record<never, never>
>;

/**
 * Infers the Nest route handler type for a given route declaration.
 */
export type RouteHandler<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = DefaultNestContext,
> = ServerRouteHandler<E, NestHandlerContext<TContext>>;

/**
 * Builds a Nest route implementation for a single contract route.
 */
export function route<
	const TRoute extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = DefaultNestContext,
>(
	contract: TRoute,
	handler: RouteHandler<TRoute, TContext>,
): RouteImplementation<TRoute> {
	return serverRoute(contract, handler as never);
}

/**
 * Builds a Nest router implementation for a contract.
 */
export function router<
	const TContract extends NestContract,
	TContext extends Record<string, unknown> = DefaultNestContext,
>(
	contract: TContract,
	handlers: RouteHandlers<TContract, TContext>,
): ImplementationTreeFor<TContract, HttpRouteDeclaration> {
	return serverRouter(contract, handlers as never) as ImplementationTreeFor<
		TContract,
		HttpRouteDeclaration
	>;
}
