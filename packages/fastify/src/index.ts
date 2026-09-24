import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type ContractImplementor,
	type RouteHandler as ServerRouteHandler,
	type RouteRequest as ServerRouteRequest,
	type ServerRouteBuilder,
} from "@rest-rpc/server";
import type { FastifyReply, FastifyRequest } from "fastify";

type FastifyHandlerFields = {
	req: FastifyRequest;
	reply: FastifyReply;
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
	ExtendedFastifyPreHandler,
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
 * Infers the validated request and Fastify context available to a route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<TRoute extends ContractRoute> = ServerRouteRequest<
	TRoute["~restrpc"],
	FastifyHandlerFields,
	DefaultContext
>;

/**
 * Infers the Fastify handler signature for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<TRoute extends ContractRoute> = ServerRouteHandler<
	TRoute["~restrpc"],
	FastifyHandlerFields,
	DefaultContext
>;

/**
 * Entry point for declaring routes with handlers for Fastify.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 * @see {@link https://rest-rpc.dev/docs/server/fastify#framework-context}
 */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	FastifyHandlerFields,
	DefaultContext
>;

/**
 * Creates typed Fastify handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, FastifyHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		FastifyHandlerFields,
		DefaultContext
	>;
}
