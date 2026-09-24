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

/** Application context shared by middleware and handlers. Augment this interface globally. */
export interface DefaultContext {}

type ContractRoute = { readonly "~restrpc": RouteDeclaration };

export { type } from "@rest-rpc/core";
export type {
	RouteErrors,
	RouteRequestData,
	RouteResponse,
} from "@rest-rpc/server";
export type {
	ExtendedHonoMiddleware,
	RequestValidationErrorHandler,
	ResponseValidationErrorHandler,
	RegisterRoutesOptions,
} from "./registerRoutes.ts";
export { registerRoutes } from "./registerRoutes.ts";
export {
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
	BodyCodec,
} from "@rest-rpc/core";
export { createOpenApiDocument } from "@rest-rpc/core";

/**
 * Infers the validated request and Hono context available to a route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	TRoute extends ContractRoute,
	TEnv extends Env = Env,
> = ServerRouteRequest<
	TRoute["~restrpc"],
	HonoHandlerFields<TEnv>,
	DefaultContext
>;

/**
 * Infers the Hono handler signature for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<
	TRoute extends ContractRoute,
	TEnv extends Env = Env,
> = ServerRouteHandler<
	TRoute["~restrpc"],
	HonoHandlerFields<TEnv>,
	DefaultContext
>;

/**
 * Entry point for declaring routes with handlers for Hono.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 * @see {@link https://rest-rpc.dev/docs/server/hono#framework-context}
 */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	HonoHandlerFields,
	DefaultContext
>;

/**
 * Creates typed Hono handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, HonoHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		HonoHandlerFields,
		DefaultContext
	>;
}
