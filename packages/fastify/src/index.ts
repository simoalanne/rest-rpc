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
import type { FastifyRequest } from "fastify";

export type {
	ClearCookieOptions,
	CookiePriority,
	SameSite,
	SetCookieOptions,
} from "@rest-rpc/server";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export { ContractResponseError, clearCookie, createRouteMatcher, setCookie };

export type HttpRouteHandlerContext = {
	req: FastifyRequest;
	signal: AbortSignal;
};

export type WebSocketRouteHandlerContext = {
	req: FastifyRequest;
};

export type RouteRequest<E extends HttpRouteDeclaration> =
	ServerInferRouteHandlerRequest<E, HttpRouteHandlerContext>;
export type RouteResponse<E extends HttpRouteDeclaration> =
	ServerInferRouteHandlerResponse<E>;
export type WebSocketRequest<E extends WebSocketRouteDeclaration> =
	ServerInferWebSocketRouteHandlerRequest<E, WebSocketRouteHandlerContext>;

export type RouteHandler<E extends HttpRouteDeclaration> = ServerRouteHandler<
	E,
	HttpRouteHandlerContext
>;

export type WebSocketRouteHandler<E extends WebSocketRouteDeclaration> =
	ServerWebSocketRouteHandler<E, WebSocketRouteHandlerContext>;
export type WebSocketHandler<E extends WebSocketRouteDeclaration> =
	ServerWebSocketRouteHandler<E, WebSocketRouteHandlerContext>;

export const route = <const TNode extends RouteDeclaration>(
	contract: TNode,
	handler: RouteHandlerFor<
		TNode,
		HttpRouteHandlerContext,
		WebSocketRouteHandlerContext
	>,
): RouteImplementation<TNode> => serverRoute(contract, handler);

export const router = <const TNode extends Contract<RouteDeclaration>>(
	contract: TNode,
	handlers: ImplementationShape<
		TNode,
		HttpRouteHandlerContext,
		WebSocketRouteHandlerContext
	>,
): ImplementationTreeFor<TNode, RouteDeclaration> =>
	serverRouter(contract, handlers);

export const routes = <const TNode extends Contract<RouteDeclaration>>(
	contract: TNode,
	implementations: ImplementationTreeFor<TNode, RouteDeclaration>,
): ImplementationTreeFor<TNode, RouteDeclaration> =>
	serverRoutes(contract, implementations);
