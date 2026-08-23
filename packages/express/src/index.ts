import type { IncomingMessage } from "node:http";
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
	type RouterImplementationInput,
	type RouteHandler as ServerRouteHandler,
	type RouteRequest as ServerRouteRequest,
	route as serverRoute,
	router as serverRouter,
	setCookie,
} from "@rest-rpc/server";
import type { Request } from "express";

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
export type { ExtendedExpressMiddleware } from "./http.ts";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export { clearCookie, RouteResponseError, setCookie };

/**
 * The context object passed to Express HTTP route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#framework-context}
 */
export type HttpRouteHandlerContext = {
	req: Request;
	signal: AbortSignal;
};

/**
 * The context object passed to Express WebSocket route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#framework-context}
 */
export type WebSocketRouteHandlerContext = {
	req: IncomingMessage;
};

type RouteContext<E extends RouteDeclaration> =
	E extends WebSocketRouteDeclaration
		? WebSocketRouteHandlerContext
		: HttpRouteHandlerContext;

/**
 * Infers the route handler request type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<E extends RouteDeclaration> = ServerRouteRequest<
	E,
	RouteContext<E>
>;

/**
 * Infers the Express route handler type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<E extends RouteDeclaration> = ServerRouteHandler<
	E,
	RouteContext<E>
>;

/**
 * Builds an Express route implementation for a single contract route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express}
 */
export function route<const TNode extends RouteDeclaration>(
	contract: TNode,
	handler: RouteHandlerFor<
		TNode,
		HttpRouteHandlerContext,
		WebSocketRouteHandlerContext
	>,
): RouteImplementation<TNode> {
	return serverRoute(contract, handler);
}

/**
 * Builds an Express router implementation for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express}
 */
export function router<const TNode extends Contract<RouteDeclaration>>(
	contract: TNode,
	handlers: RouterImplementationInput<
		TNode,
		HttpRouteHandlerContext,
		WebSocketRouteHandlerContext
	>,
): ImplementationTreeFor<TNode, RouteDeclaration> {
	return serverRouter(contract, handlers);
}
