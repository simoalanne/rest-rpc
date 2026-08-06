export { isCustomBody } from "@contract-first-api/core/contract";

import type { HttpRouteDeclaration } from "@contract-first-api/core/contract";
import type { Request } from "express";
import {
	type Contract,
	type ImplementationShape,
	type ImplementationTreeFor,
	type RouteImplementation,
	type InferRouteHandlerRequest as ServerInferRouteHandlerRequest,
	type RouteHandler as ServerRouteHandler,
	route as serverRoute,
	router as serverRouter,
	routes as serverRoutes,
} from "../server/router.ts";

export { matchRoute } from "../server/match.ts";
export { ContractResponseError } from "../server/response.ts";
export type { InferRouteHandlerResponse } from "../server/router.ts";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";

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
