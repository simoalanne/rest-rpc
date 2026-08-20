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
import type { FastifyRequest } from "fastify";

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
export type { ExtendedFastifyPreHandler } from "./http.ts";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export { clearCookie, RouteResponseError, setCookie };

export type HttpRouteHandlerContext = {
	req: FastifyRequest;
	signal: AbortSignal;
};

export type WebSocketRouteHandlerContext = {
	req: FastifyRequest;
};

type RouteContext<E extends RouteDeclaration> =
	E extends WebSocketRouteDeclaration
		? WebSocketRouteHandlerContext
		: HttpRouteHandlerContext;

export type RouteRequest<E extends RouteDeclaration> = ServerRouteRequest<
	E,
	RouteContext<E>
>;
export type RouteHandler<E extends RouteDeclaration> = ServerRouteHandler<
	E,
	RouteContext<E>
>;

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
	handlers: RouterImplementationInput<
		TNode,
		HttpRouteHandlerContext,
		WebSocketRouteHandlerContext
	>,
): ImplementationTreeFor<TNode, RouteDeclaration> =>
	serverRouter(contract, handlers);
