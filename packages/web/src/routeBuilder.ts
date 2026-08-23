import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	type ImplementationTree,
	type ImplementationTreeFor,
	type RouteHandler,
	type RouteHandlerFor,
	type RouteImplementation,
	type RouteHandlers as ServerRouteHandlers,
	type RouteRequest as ServerRouteRequest,
	route as serverRoute,
	router as serverRouter,
} from "@rest-rpc/server";

type MaybePromise<T> = T | Promise<T>;

/**
 * A contract tree containing only HTTP routes for the Web adapter.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export type WebContract = Contract<HttpRouteDeclaration>;

/**
 * An HTTP-only implementation tree for the Web adapter.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export type WebImplementationTree = ImplementationTree<HttpRouteDeclaration>;

/**
 * The context object passed to Web adapter route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export type WebRouteContext<
	TContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = TContext & {
	request: TRequest;
};

/**
 * Input passed to Web adapter middleware.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export type WebRouteMiddlewareInput<
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = {
	request: TRequest;
	route: HttpRouteDeclaration;
	runtime: TRuntimeContext;
};

/**
 * Result returned by Web adapter middleware.
 *
 * @remarks Returning a `Response` short-circuits the route handler.
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export type WebRouteMiddlewareResult<TContext extends Record<string, unknown>> =
	| Response
	| TContext
	| undefined;

/**
 * Middleware function shape for Web adapter routes.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export type WebRouteMiddleware<
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = (
	input: WebRouteMiddlewareInput<TRuntimeContext, TRequest>,
) => MaybePromise<WebRouteMiddlewareResult<TContext>>;

export type WebRouteImplementation<
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = RouteImplementation<HttpRouteDeclaration> & {
	middleware?: WebRouteMiddleware<TRuntimeContext, TContext, TRequest>;
};

/**
 * Infers the Web route handler request type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<string, unknown>,
	TRequest extends Request = Request,
> = ServerRouteRequest<E, WebRouteContext<TContext, TRequest>>;

/**
 * Handler tree accepted by `router().handlers()` when building a Web implementation tree.
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
 * @see {@link https://rest-rpc.dev/docs/recipes/class-handlers}
 */
export type RouteHandlers<
	TContract extends WebContract,
	TContext extends Record<string, unknown> = Record<string, unknown>,
	TRequest extends Request = Request,
> = ServerRouteHandlers<
	TContract,
	WebRouteContext<TContext, TRequest>,
	Record<never, never>
>;

type WebRouteBuilderWithMiddleware<
	TRoute extends HttpRouteDeclaration,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = {
	handler(
		handler: RouteHandler<TRoute, WebRouteContext<TContext, TRequest>>,
	): RouteImplementation<TRoute> & WebImplementationTree;
};

/**
 * Fluent builder for a single Web adapter route implementation.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export type WebRouteBuilder<
	TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = WebRouteBuilderWithMiddleware<TRoute, Record<never, never>, TRequest> & {
	middleware<TContext extends Record<string, unknown>>(
		middleware: WebRouteMiddleware<TRuntimeContext, TContext, TRequest>,
	): WebRouteBuilderWithMiddleware<TRoute, TContext, TRequest>;
};

type WebRouterBuilderWithMiddleware<
	TContract extends WebContract,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = {
	handlers(
		handlers: RouteHandlers<TContract, TContext, TRequest>,
	): ImplementationTreeFor<TContract, HttpRouteDeclaration> &
		WebImplementationTree;
};

/**
 * Fluent builder for a Web adapter implementation tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export type WebRouterBuilder<
	TContract extends WebContract,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = WebRouterBuilderWithMiddleware<
	TContract,
	Record<never, never>,
	TRequest
> & {
	middleware<TContext extends Record<string, unknown>>(
		middleware: WebRouteMiddleware<TRuntimeContext, TContext, TRequest>,
	): WebRouterBuilderWithMiddleware<TContract, TContext, TRequest>;
};

const attachMiddleware = <
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
	TImplementation extends WebImplementationTree,
>(
	implementation: TImplementation,
	middleware:
		| WebRouteMiddleware<TRuntimeContext, TContext, TRequest>
		| undefined,
): TImplementation => {
	if ("route" in implementation && "handler" in implementation) {
		return {
			...implementation,
			middleware,
		} as TImplementation;
	}

	return Object.fromEntries(
		Object.entries(implementation).map(([key, child]) => [
			key,
			attachMiddleware(child as WebImplementationTree, middleware),
		]),
	) as TImplementation;
};

export const createWebRouteBuilder = <
	const TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TContext extends Record<string, unknown> = Record<never, never>,
>(
	contract: TRoute,
	middleware?: WebRouteMiddleware<TRuntimeContext, TContext, TRequest>,
): WebRouteBuilder<TRoute, TRuntimeContext, TRequest> &
	WebRouteBuilderWithMiddleware<TRoute, TContext, TRequest> => ({
	middleware: (middleware) =>
		createWebRouteBuilder(contract, middleware) as never,
	handler: (handler) =>
		attachMiddleware(
			serverRoute<
				TRoute,
				WebRouteContext<TContext, TRequest>,
				Record<never, never>
			>(
				contract,
				handler as RouteHandlerFor<TRoute, WebRouteContext<TContext, TRequest>>,
			),
			middleware,
		) as RouteImplementation<TRoute> & WebImplementationTree,
});

export const createWebRouterBuilder = <
	const TContract extends WebContract,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TContext extends Record<string, unknown> = Record<never, never>,
>(
	contract: TContract,
	middleware?: WebRouteMiddleware<TRuntimeContext, TContext, TRequest>,
): WebRouterBuilder<TContract, TRuntimeContext, TRequest> &
	WebRouterBuilderWithMiddleware<TContract, TContext, TRequest> => ({
	middleware: (middleware) =>
		createWebRouterBuilder(contract, middleware) as never,
	handlers: (handlers) =>
		attachMiddleware(
			serverRouter<
				TContract,
				WebRouteContext<TContext, TRequest>,
				Record<never, never>
			>(contract, handlers) as ImplementationTreeFor<
				TContract,
				HttpRouteDeclaration
			>,
			middleware,
		) as ImplementationTreeFor<TContract, HttpRouteDeclaration> &
			WebImplementationTree,
});
