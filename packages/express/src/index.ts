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

/** Application context shared by middleware and handlers. Augment this interface globally. */
export interface DefaultContext {}

type ContractRoute = { readonly "~restrpc": RouteDeclaration };

export { type } from "@rest-rpc/core";
export type {
	InferServerRequest,
	InferServerResponse,
	RouteErrors,
} from "@rest-rpc/server";
export type {
	ExtendedExpressMiddleware,
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
export { sse } from "@rest-rpc/server";
export type { SseEvent } from "@rest-rpc/core";

/**
 * Infers the validated request and Express context available to a route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteRequest<TRoute extends ContractRoute> = ServerRouteRequest<
	TRoute["~restrpc"],
	ExpressHandlerFields,
	DefaultContext
>;

/**
 * Infers the Express handler signature for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteHandler<TRoute extends ContractRoute> = ServerRouteHandler<
	TRoute["~restrpc"],
	ExpressHandlerFields,
	DefaultContext
>;

/**
 * Entry point for declaring routes with handlers for Express.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 * @see {@link https://rest-rpc.dev/docs/server/express#framework-context}
 */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	ExpressHandlerFields,
	DefaultContext
>;

/**
 * Creates typed Express handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, ExpressHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		ExpressHandlerFields,
		DefaultContext
	>;
}
