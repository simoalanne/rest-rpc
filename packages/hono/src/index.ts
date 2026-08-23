import type {
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	type Contract,
	clearCookie,
	type ImplementationTreeFor,
	type RouteHandlerFor,
	type RouteImplementation,
	RouteResponseError,
	type RouteHandler as ServerRouteHandler,
	type RouteHandlers as ServerRouteHandlers,
	type RouteRequest as ServerRouteRequest,
	route as serverRoute,
	router as serverRouter,
	setCookie,
} from "@rest-rpc/server";
import type { Context } from "hono";
import type { Env } from "hono/types";

export type {
	ClearCookieOptions,
	RouteErrors,
	RouteReceived,
	RouteRequestData,
	RouteResponse,
	RouteResponseShorthand,
	RouteSent,
	RouteSocket,
	SetCookieOptions,
} from "@rest-rpc/server";
export type {
	ExtendedHonoMiddleware,
	HonoParseBody,
	HonoParseBodyInput,
} from "./http.ts";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export { clearCookie, RouteResponseError, setCookie };

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
 * The context object passed to Hono WebSocket route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#framework-context}
 */
export type WebSocketRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
};

type RouteContext<
	E extends RouteDeclaration,
	TEnv extends Env,
> = E extends WebSocketRouteDeclaration
	? WebSocketRouteHandlerContext<TEnv>
	: HttpRouteHandlerContext<TEnv>;

/**
 * Infers the route handler request type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	E extends RouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteRequest<E, RouteContext<E, TEnv>>;

/**
 * Infers the Hono route handler type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<
	E extends RouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteHandler<E, RouteContext<E, TEnv>>;

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
 * @see {@link https://rest-rpc.dev/docs/recipes/class-handlers}
 */
export type RouteHandlers<
	TNode extends Contract<RouteDeclaration>,
	TEnv extends Env = Env,
> = ServerRouteHandlers<
	TNode,
	HttpRouteHandlerContext<TEnv>,
	WebSocketRouteHandlerContext<TEnv>
>;

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
	handler: RouteHandlerFor<
		TNode,
		HttpRouteHandlerContext<TEnv>,
		WebSocketRouteHandlerContext<TEnv>
	>,
): RouteImplementation<TNode> {
	return serverRoute(contract, handler);
}

/**
 * Builds a Hono router implementation for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function router<
	const TNode extends Contract<RouteDeclaration>,
	TEnv extends Env = Env,
>(
	contract: TNode,
	handlers: RouteHandlers<TNode, TEnv>,
): ImplementationTreeFor<TNode, RouteDeclaration> {
	return serverRouter(contract, handlers);
}
