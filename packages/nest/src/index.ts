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

/** Infers the request passed to a Nest route handler. */
export type RouteRequest<TRoute extends ContractRoute> = ServerRouteRequest<
	TRoute["~restrpc"],
	NestHandlerFields,
	DefaultContext
>;

/** Infers a Nest route handler for a route declaration. */
export type RouteHandler<TRoute extends ContractRoute> = ServerRouteHandler<
	TRoute["~restrpc"],
	NestHandlerFields,
	DefaultContext
>;

/** Starts a Nest server-first route builder chain. */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	NestHandlerFields,
	DefaultContext
>;

/** Exposes Nest handler attachment on every route in a core contract. */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, NestHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		NestHandlerFields,
		DefaultContext
	>;
}
