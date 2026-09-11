import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	type ImplementationTreeFor,
	type RouteImplementation,
	type RouteHandler as ServerRouteHandler,
	type RouteHandlers as ServerRouteHandlers,
	type RouteRequest as ServerRouteRequest,
	route as serverRoute,
	router as serverRouter,
} from "@rest-rpc/server";
import type { FastifyRequest } from "fastify";

export type {
	RouteErrors,
	RouteRequestData,
	RouteResponse,
	RouteResponseShorthand,
} from "@rest-rpc/server";
export type {
	ExtendedFastifyPreHandler,
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
 * The context object passed to Fastify HTTP route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#framework-context}
 */
export type HttpRouteHandlerContext = {
	req: FastifyRequest;
	signal: AbortSignal;
};

/**
 * Infers the route handler request type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<E extends RouteDeclaration> = ServerRouteRequest<
	E,
	HttpRouteHandlerContext
>;

/**
 * Infers the Fastify route handler type for a given route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<E extends RouteDeclaration> = ServerRouteHandler<
	E,
	HttpRouteHandlerContext
>;

/**
 * Handler tree accepted by `router()` when building a Fastify implementation tree.
 *
 * @remarks Use this type with `implements` to check class-based route handler
 * services against a contract tree.
 *
 * @example
 * ```ts
 * class TodoHandlers implements RouteHandlers<typeof api.todos> {
 *   get(request: RouteRequest<typeof api.todos.get>) {
 *     return { id: request.id };
 *   }
 * }
 * ```
 *
 * @see {@link https://rest-rpc.dev/docs/recipes/organizing-route-handlers#service-classes-as-handlers}
 */
export type RouteHandlers<TNode extends Contract> = ServerRouteHandlers<
	TNode,
	HttpRouteHandlerContext
>;

/**
 * Builds a Fastify route implementation for a single contract route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify}
 */
export function route<const TNode extends RouteDeclaration>(
	contract: TNode,
	handler: RouteHandler<TNode>,
): RouteImplementation<TNode> {
	return serverRoute(contract, handler);
}

/**
 * Builds a Fastify router implementation for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify}
 */
export function router<const TNode extends Contract>(
	contract: TNode,
	handlers: RouteHandlers<TNode>,
): ImplementationTreeFor<TNode> {
	return serverRouter(contract, handlers);
}
