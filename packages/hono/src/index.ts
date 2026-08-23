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

export type HttpRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
	signal: AbortSignal;
};

export type WebSocketRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
};

type RouteContext<
	E extends RouteDeclaration,
	TEnv extends Env,
> = E extends WebSocketRouteDeclaration
	? WebSocketRouteHandlerContext<TEnv>
	: HttpRouteHandlerContext<TEnv>;

export type RouteRequest<
	E extends RouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteRequest<E, RouteContext<E, TEnv>>;

export type RouteHandler<
	E extends RouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteHandler<E, RouteContext<E, TEnv>>;

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

export function router<
	const TNode extends Contract<RouteDeclaration>,
	TEnv extends Env = Env,
>(
	contract: TNode,
	handlers: RouterImplementationInput<
		TNode,
		HttpRouteHandlerContext<TEnv>,
		WebSocketRouteHandlerContext<TEnv>
	>,
): ImplementationTreeFor<TNode, RouteDeclaration> {
	return serverRouter(contract, handlers);
}
