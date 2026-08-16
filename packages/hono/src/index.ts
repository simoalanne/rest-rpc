import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	type Contract,
	ContractResponseError,
	clearCookie,
	createRouteMatcher,
	type ImplementationShape,
	type ImplementationTreeFor,
	type RouteHandlerFor,
	type RouteImplementation,
	type InferRouteHandlerRequest as ServerInferRouteHandlerRequest,
	type InferRouteHandlerResponse as ServerInferRouteHandlerResponse,
	type InferWebSocketRouteHandlerRequest as ServerInferWebSocketRouteHandlerRequest,
	type RouteHandler as ServerRouteHandler,
	type WebSocketRouteHandler as ServerWebSocketRouteHandler,
	route as serverRoute,
	router as serverRouter,
	routes as serverRoutes,
	setCookie,
} from "@rest-rpc/server";
import type { Context } from "hono";
import type { Env } from "hono/types";

export type {
	ClearCookieOptions,
	CookiePriority,
	SameSite,
	SetCookieOptions,
} from "@rest-rpc/server";
export type { HonoParseBody, HonoParseBodyInput } from "./http.ts";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export { ContractResponseError, clearCookie, createRouteMatcher, setCookie };

export type HttpRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
};

export type WebSocketRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
};

export type RouteRequest<
	E extends HttpRouteDeclaration,
	TEnv extends Env = Env,
> = ServerInferRouteHandlerRequest<E, HttpRouteHandlerContext<TEnv>>;

export type RouteResponse<E extends HttpRouteDeclaration> =
	ServerInferRouteHandlerResponse<E>;

export type WebSocketRequest<
	E extends WebSocketRouteDeclaration,
	TEnv extends Env = Env,
> = ServerInferWebSocketRouteHandlerRequest<
	E,
	WebSocketRouteHandlerContext<TEnv>
>;

export type RouteHandler<
	E extends HttpRouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteHandler<E, HttpRouteHandlerContext<TEnv>>;

export type WebSocketRouteHandler<
	E extends WebSocketRouteDeclaration,
	TEnv extends Env = Env,
> = ServerWebSocketRouteHandler<E, WebSocketRouteHandlerContext<TEnv>>;
export type WebSocketHandler<
	E extends WebSocketRouteDeclaration,
	TEnv extends Env = Env,
> = ServerWebSocketRouteHandler<E, WebSocketRouteHandlerContext<TEnv>>;

export const route = <
	const TNode extends RouteDeclaration,
	TEnv extends Env = Env,
>(
	contract: TNode,
	handler: RouteHandlerFor<
		TNode,
		HttpRouteHandlerContext<TEnv>,
		WebSocketRouteHandlerContext<TEnv>
	>,
): RouteImplementation<TNode> => serverRoute(contract, handler);

export const router = <
	const TNode extends Contract<RouteDeclaration>,
	TEnv extends Env = Env,
>(
	contract: TNode,
	handlers: ImplementationShape<
		TNode,
		HttpRouteHandlerContext<TEnv>,
		WebSocketRouteHandlerContext<TEnv>
	>,
): ImplementationTreeFor<TNode, RouteDeclaration> =>
	serverRouter(contract, handlers);

export const routes = <const TNode extends Contract<RouteDeclaration>>(
	contract: TNode,
	implementations: ImplementationTreeFor<TNode, RouteDeclaration>,
): ImplementationTreeFor<TNode, RouteDeclaration> =>
	serverRoutes(contract, implementations);
