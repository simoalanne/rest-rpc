import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import {
	type Contract,
	type ImplementationShape,
	type ImplementationTreeFor,
	type RouteHandlerFor,
	type RouteImplementation,
	type InferRouteHandlerRequest as ServerInferRouteHandlerRequest,
	type InferWebSocketRouteHandlerRequest as ServerInferWebSocketRouteHandlerRequest,
	type RouteHandler as ServerRouteHandler,
	type WebSocketRouteHandler as ServerWebSocketRouteHandler,
	route as serverRoute,
	router as serverRouter,
	routes as serverRoutes,
} from "@contract-first-api/server";
import type { Context } from "hono";
import type { Env } from "hono/types";

export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export type {
	HonoBeforeUpgradeInput,
	HonoParseBody,
	HonoParseBodyInput,
	HonoWebSocketOptions,
	HonoWebSocketRegistration,
} from "./types.ts";
export { honoWebSocket } from "./websocket.ts";

export type HttpRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
};

export type WebSocketRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
};

export type InferRouteHandlerRequest<
	E extends HttpRouteDeclaration,
	TEnv extends Env = Env,
> = ServerInferRouteHandlerRequest<E, HttpRouteHandlerContext<TEnv>>;

export type InferWebSocketRouteHandlerRequest<
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
