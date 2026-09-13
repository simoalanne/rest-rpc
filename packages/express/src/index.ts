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

/**
 * Infers the validated request and Express context available to a route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<TRoute extends ContractRoute> = ServerRouteRequest<
	TRoute["~restrpc"],
	ExpressHandlerFields
>;

/**
 * Infers the Express handler signature for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<TRoute extends ContractRoute> = ServerRouteHandler<
	TRoute["~restrpc"],
	ExpressHandlerFields
>;

/**
 * Entry point for declaring server-first routes handled by Express.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first/server}
 * @see {@link https://rest-rpc.dev/docs/server/express#framework-context}
 */
export const route =
	serverFirstRoute as unknown as ServerRouteBuilder<ExpressHandlerFields>;

/**
 * Creates typed Express handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, ExpressHandlerFields> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		ExpressHandlerFields
	>;
}
