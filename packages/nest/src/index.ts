import type { ExecutionContext } from "@nestjs/common";
import type { Contract, RouteTree } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type Contractimplementer,
	type RouteHandlerFor,
	type ServerRouteBuilder,
} from "@rest-rpc/server";

/**
 * The default application context shared by handlers and middleware. Augment this interface globally.
 * Defaults to an empty object if not extended.
 *
 * @default {}
 */
export interface DefaultContext {}

type NestHandlerFields = {
	executionContext: ExecutionContext;
	signal: AbortSignal;
};

export { type } from "@rest-rpc/core";
export type {
	Context,
	InferServerRequest,
	InferServerResponse,
} from "@rest-rpc/server";
export {
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
export { Implement } from "./decorators.ts";
export type { RestRpcModuleOptions } from "./module.ts";
export { RestRpcModule } from "./module.ts";
export {
	RequestValidationException,
	ResponseValidationException,
} from "./validationExceptions.ts";
export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
	BodyCodec,
} from "@rest-rpc/core";
export { createOpenApiDocument } from "@rest-rpc/core";
export { sse } from "@rest-rpc/server";
export type { SseEvent } from "@rest-rpc/core";

/**
 * Infers the Nest handler signature for a route declaration.
 *
 * @remarks Use a route declared without `.handler()` to write its handler
 * separately. Pass a route tree to infer a matching tree of handler types.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-server-handler}
 */
export type InferServerHandler<TRoute extends RouteTree> = RouteHandlerFor<
	TRoute,
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
): Contractimplementer<TContract, NestHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as Contractimplementer<
		TContract,
		NestHandlerFields,
		DefaultContext
	>;
}
