import type { ExecutionContext } from "@nestjs/common";
import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type ContractImplementor,
	type RouteHandler as ServerRouteHandler,
	type RouteRequest as ServerRouteRequest,
	type ServerRouteBuilder,
} from "@rest-rpc/server";
import type { DefaultContext } from "./module.ts";

type NestHandlerFields = {
	executionContext: ExecutionContext;
	signal: AbortSignal;
};

type ContractRoute = { readonly "~restrpc": RouteDeclaration };

export type {
	RouteErrors,
	RouteRequestData,
	RouteResponse,
} from "@rest-rpc/server";
export {
	RequestValidationError,
	ResponseValidationError,
	RouteResponseError,
} from "@rest-rpc/server";
export { Implement } from "./decorators.ts";
export type { DefaultContext, RestRpcModuleOptions } from "./module.ts";
export { RestRpcModule } from "./module.ts";
export {
	RequestValidationException,
	ResponseValidationException,
} from "./validationExceptions.ts";

/**
 * Infers the validated request and Nest context available to a route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<TRoute extends ContractRoute> = ServerRouteRequest<
	TRoute["~restrpc"],
	NestHandlerFields,
	DefaultContext
>;

/**
 * Infers the Nest handler signature for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<TRoute extends ContractRoute> = ServerRouteHandler<
	TRoute["~restrpc"],
	NestHandlerFields,
	DefaultContext
>;

/**
 * Entry point for declaring routes with handlers for Nest.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 * @see {@link https://rest-rpc.dev/docs/server/nest#usage}
 */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	NestHandlerFields,
	DefaultContext
>;

/**
 * Creates typed Nest handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, NestHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		NestHandlerFields,
		DefaultContext
	>;
}
