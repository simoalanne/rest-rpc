import type { Contract, RouteTree } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type Contractimplementer,
	type RouteHandlerFor,
	type ServerRouteBuilder,
} from "@rest-rpc/server";
import type { Context } from "hono";
import type { Env } from "hono/types";

type HonoHandlerFields<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	signal: AbortSignal;
};

/**
 * The default application context shared by handlers and middleware. Augment this interface globally.
 * Defaults to an empty object if not extended.
 *
 * @default {}
 */
export interface DefaultContext {}

export { type } from "@rest-rpc/core";
export type {
	Context,
	InferServerRequest,
	InferServerResponse,
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
export { sse } from "@rest-rpc/server";
export type { SseEvent } from "@rest-rpc/core";

/**
 * Infers the Hono handler signature for a route declaration.
 *
 * @remarks Use a route declared without `.handler()` to write its handler
 * separately. Pass a route tree to infer a matching tree of handler types.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-server-handler}
 */
export type InferServerHandler<
	TRoute extends RouteTree,
	TEnv extends Env = Env,
> = RouteHandlerFor<TRoute, HonoHandlerFields<TEnv>, DefaultContext>;

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
): Contractimplementer<TContract, HonoHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as Contractimplementer<
		TContract,
		HonoHandlerFields,
		DefaultContext
	>;
}
