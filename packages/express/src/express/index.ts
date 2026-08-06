export { isCustomBody } from "@contract-first-api/core/contract";

import type { HttpRouteDeclaration } from "@contract-first-api/core/contract";
import {
	type Contract,
	ContractResponseError,
	type ImplementationShape,
	type ImplementationTreeFor,
	type InferRouteHandlerResponse,
	matchRoute,
	type RouteImplementation,
	type InferRouteHandlerRequest as ServerInferRouteHandlerRequest,
	type RouteHandler as ServerRouteHandler,
	route as serverRoute,
	router as serverRouter,
	routes as serverRoutes,
} from "@contract-first-api/server";
import type { Request } from "express";

export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export type { InferRouteHandlerResponse };
export { ContractResponseError, matchRoute };

export type HttpRouteHandlerContext = {
	req: Request;
};

export type InferRouteHandlerRequest<E extends HttpRouteDeclaration> =
	ServerInferRouteHandlerRequest<E, HttpRouteHandlerContext>;

export type RouteHandler<E extends HttpRouteDeclaration> = ServerRouteHandler<
	E,
	HttpRouteHandlerContext
>;

export const route = <const TNode extends HttpRouteDeclaration>(
	contract: TNode,
	handler: RouteHandler<TNode>,
): RouteImplementation<TNode> => serverRoute(contract, handler);

export const router = <const TNode extends Contract<HttpRouteDeclaration>>(
	contract: TNode,
	handlers: ImplementationShape<TNode, HttpRouteHandlerContext>,
): ImplementationTreeFor<TNode, HttpRouteDeclaration> =>
	serverRouter(contract, handlers);

export const routes = <const TNode extends Contract<HttpRouteDeclaration>>(
	contract: TNode,
	implementations: ImplementationTreeFor<TNode, HttpRouteDeclaration>,
): ImplementationTreeFor<TNode, HttpRouteDeclaration> =>
	serverRoutes(contract, implementations);
