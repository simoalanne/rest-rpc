import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type ContractImplementor,
	type RouteHandler as ServerRouteHandler,
	type RouteRequest as ServerRouteRequest,
	type ServerRouteBuilder,
} from "@rest-rpc/server";
import type { Request, Response } from "express";

type ExpressHandlerFields = {
	req: Request;
	res: Response;
	signal: AbortSignal;
};

type ContractRoute = { readonly "~restrpc": RouteDeclaration };

export type {
	RouteErrors,
	RouteRequestData,
	RouteResponse,
} from "@rest-rpc/server";
export type {
	ExtendedExpressMiddleware,
	RequestValidationErrorHandler,
	ResponseValidationErrorHandler,
} from "./http.ts";
export type { RegisterRoutesOptions } from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export {
	RequestValidationError,
	ResponseValidationError,
	RouteResponseError,
} from "@rest-rpc/server";

/** Infers the request passed to an Express route handler. */
export type RouteRequest<TRoute extends ContractRoute> = ServerRouteRequest<
	TRoute["~restrpc"],
	ExpressHandlerFields
>;

/** Infers an Express route handler for a route declaration. */
export type RouteHandler<TRoute extends ContractRoute> = ServerRouteHandler<
	TRoute["~restrpc"],
	ExpressHandlerFields
>;

/** Starts an Express server-first route builder chain. */
export const route =
	serverFirstRoute as unknown as ServerRouteBuilder<ExpressHandlerFields>;

/** Exposes Express handler attachment on every route in a core contract. */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, ExpressHandlerFields> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		ExpressHandlerFields
	>;
}
