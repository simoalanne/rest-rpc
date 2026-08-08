export { isCustomBody } from "@rest-rpc/core/contract";

import type { IncomingMessage } from "node:http";
import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	type Contract,
	ContractResponseError,
	type ImplementationShape,
	type ImplementationTreeFor,
	type InferRouteHandlerResponse,
	matchRoute,
	type RouteHandlerFor,
	type RouteImplementation,
	type InferRouteHandlerRequest as ServerInferRouteHandlerRequest,
	type InferWebSocketRouteHandlerRequest as ServerInferWebSocketRouteHandlerRequest,
	type RouteHandler as ServerRouteHandler,
	type WebSocketRouteHandler as ServerWebSocketRouteHandler,
	route as serverRoute,
	router as serverRouter,
	routes as serverRoutes,
} from "@rest-rpc/server";
import type { Request } from "express";

export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export type {
	ExpressWebSocketOptions,
	ExpressWebSocketRegistration,
} from "./websocket.ts";
export { expressWebSocket } from "./websocket.ts";
export type { InferRouteHandlerResponse };
export { ContractResponseError, matchRoute };

export type HttpRouteHandlerContext = {
	req: Request;
};

export type WebSocketRouteHandlerContext = {
	req: IncomingMessage;
};

export type InferRouteHandlerRequest<E extends HttpRouteDeclaration> =
	ServerInferRouteHandlerRequest<E, HttpRouteHandlerContext>;

export type InferWebSocketRouteHandlerRequest<
	E extends WebSocketRouteDeclaration,
> = ServerInferWebSocketRouteHandlerRequest<E, WebSocketRouteHandlerContext>;

export type RouteHandler<E extends HttpRouteDeclaration> = ServerRouteHandler<
	E,
	HttpRouteHandlerContext
>;

export type WebSocketRouteHandler<E extends WebSocketRouteDeclaration> =
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
