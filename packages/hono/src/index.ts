import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type ContractImplementor,
	type RouteHandler as ServerRouteHandler,
	type RouteRequest as ServerRouteRequest,
	type ServerRouteBuilder,
} from "@rest-rpc/server";
import type { Context } from "hono";
import type { Env } from "hono/types";

type HonoHandlerFields<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	signal: AbortSignal;
};

type ContractRoute = { readonly "~restrpc": RouteDeclaration };

export type {
	RouteErrors,
	RouteRequestData,
	RouteResponse,
} from "@rest-rpc/server";
export type {
	ExtendedHonoMiddleware,
	HonoBodyParser,
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

/** Infers the request passed to a Hono route handler. */
export type RouteRequest<
	TRoute extends ContractRoute,
	TEnv extends Env = Env,
> = ServerRouteRequest<TRoute["~restrpc"], HonoHandlerFields<TEnv>>;

/** Infers a Hono route handler for a route declaration. */
export type RouteHandler<
	TRoute extends ContractRoute,
	TEnv extends Env = Env,
> = ServerRouteHandler<TRoute["~restrpc"], HonoHandlerFields<TEnv>>;

/** Starts a Hono server-first route builder chain. */
export const route =
	serverFirstRoute as unknown as ServerRouteBuilder<HonoHandlerFields>;

/** Exposes Hono handler attachment on every route in a core contract. */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, HonoHandlerFields> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		HonoHandlerFields
	>;
}
