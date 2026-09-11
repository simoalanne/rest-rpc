import type { RouteDeclaration } from "@rest-rpc/core/contract";
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
import type { Context } from "hono";
import type { Env } from "hono/types";

export type {
	RouteErrors,
	RouteRequestData,
	RouteResponse,
	RouteResponseShorthand,
} from "@rest-rpc/server";
export type {
	ExtendedHonoMiddleware,
	HonoBodyParser,
	RequestValidationErrorHandler,
	ResponseValidationErrorHandler,
} from "./http.ts";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export {
	RequestValidationError,
	ResponseValidationError,
	RouteResponseError,
} from "@rest-rpc/server";

/**
 * The context object passed to Hono HTTP route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#framework-context}
 */
export type HttpRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
	signal: AbortSignal;
};

/**
 * Infers the route handler request type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	E extends RouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteRequest<E, HttpRouteHandlerContext<TEnv>>;

/**
 * Infers the Hono route handler type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<
	E extends RouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteHandler<E, HttpRouteHandlerContext<TEnv>>;

/**
 * Handler tree accepted by `router()` when building a Hono implementation tree.
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
	TNode extends Contract,
	TEnv extends Env = Env,
> = ServerRouteHandlers<TNode, HttpRouteHandlerContext<TEnv>>;

/**
 * Builds a Hono route implementation for a single contract route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function route<
	const TNode extends RouteDeclaration,
	TEnv extends Env = Env,
>(
	contract: TNode,
	handler: RouteHandler<TNode, TEnv>,
): RouteImplementation<TNode> {
	return serverRoute(contract, handler);
}

/**
 * Builds a Hono router implementation for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function router<const TNode extends Contract, TEnv extends Env = Env>(
	contract: TNode,
	handlers: RouteHandlers<TNode, TEnv>,
): ImplementationTreeFor<TNode> {
	return serverRouter(contract, handlers);
}
