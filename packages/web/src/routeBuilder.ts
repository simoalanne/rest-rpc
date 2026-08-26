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
type Merge<T> = {
	[K in keyof T]: T[K];
};
type MergeContext<
	TContext extends Record<string, unknown>,
	TNextContext extends Record<string, unknown>,
> = Merge<Omit<TContext, keyof TNextContext> & TNextContext>;

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
> = Merge<
	TContext & {
		request: TRequest;
	}
>;

/**
 * Input passed to Web adapter middleware.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export type WebRouteMiddlewareInput<
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TContext extends Record<string, unknown> = Record<never, never>,
> = {
	context: TContext;
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
export type WebRouteMiddlewareResult<
	TContext extends Record<string, unknown>,
> = Response | TContext | undefined;

/**
 * Middleware function shape for Web adapter routes.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export type WebRouteMiddleware<
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TInputContext extends Record<string, unknown> = Record<never, never>,
> = (
	input: WebRouteMiddlewareInput<TRuntimeContext, TRequest, TInputContext>,
) => MaybePromise<WebRouteMiddlewareResult<TContext>>;

export type WebRouteImplementation<
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = RouteImplementation<HttpRouteDeclaration> & {
	middleware?: WebRouteMiddleware<
		TRuntimeContext,
		Record<string, unknown>,
		TRequest,
		Record<string, unknown>
	>[];
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
 * Builder for a single Web adapter route implementation.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export type WebRouteBuilder<
	TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = WebRouteBuilderWithStackedMiddleware<
	TRoute,
	TRuntimeContext,
	Record<never, never>,
	TRequest
>;

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
 * Builder for a Web adapter implementation tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export type WebRouterBuilder<
	TContract extends WebContract,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = WebRouterBuilderWithMiddleware<TContract, Record<never, never>, TRequest> &
	WebRouterBuilderWithStackedMiddleware<
		TContract,
		TRuntimeContext,
		Record<never, never>,
		TRequest
	>;

type WebRouteBuilderWithStackedMiddleware<
	TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = WebRouteBuilderWithMiddleware<TRoute, TContext, TRequest> & {
	middleware<TNextContext extends Record<string, unknown>>(
		middleware: WebRouteMiddleware<
			TRuntimeContext,
			TNextContext,
			TRequest,
			TContext
		>,
	): WebRouteBuilderWithStackedMiddleware<
		TRoute,
		TRuntimeContext,
		MergeContext<TContext, TNextContext>,
		TRequest
	>;
};

type WebRouterBuilderWithStackedMiddleware<
	TContract extends WebContract,
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = WebRouterBuilderWithMiddleware<TContract, TContext, TRequest> & {
	middleware<TNextContext extends Record<string, unknown>>(
		middleware: WebRouteMiddleware<
			TRuntimeContext,
			TNextContext,
			TRequest,
			TContext
		>,
	): WebRouterBuilderWithStackedMiddleware<
		TContract,
		TRuntimeContext,
		MergeContext<TContext, TNextContext>,
		TRequest
	>;
};

const attachMiddleware = <
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request,
	TImplementation extends WebImplementationTree,
>(
	implementation: TImplementation,
	middleware:
		| WebRouteMiddleware<
				TRuntimeContext,
				Record<string, unknown>,
				TRequest,
				Record<string, unknown>
		  >[]
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
	middlewares: WebRouteMiddleware<
		TRuntimeContext,
		Record<string, unknown>,
		TRequest,
		Record<string, unknown>
	>[] = [],
): WebRouteBuilder<TRoute, TRuntimeContext, TRequest> &
	WebRouteBuilderWithStackedMiddleware<
		TRoute,
		TRuntimeContext,
		TContext,
		TRequest
	> => ({
	middleware: (nextMiddleware) =>
		createWebRouteBuilder(contract, [
			...middlewares,
			nextMiddleware as WebRouteMiddleware<
				TRuntimeContext,
				Record<string, unknown>,
				TRequest,
				Record<string, unknown>
			>,
		]) as never,
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
			middlewares,
		) as RouteImplementation<TRoute> & WebImplementationTree,
});

export const createWebRouterBuilder = <
	const TContract extends WebContract,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TContext extends Record<string, unknown> = Record<never, never>,
>(
	contract: TContract,
	middlewares: WebRouteMiddleware<
		TRuntimeContext,
		Record<string, unknown>,
		TRequest,
		Record<string, unknown>
	>[] = [],
): WebRouterBuilder<TContract, TRuntimeContext, TRequest> &
	WebRouterBuilderWithStackedMiddleware<
		TContract,
		TRuntimeContext,
		TContext,
		TRequest
	> => ({
	middleware: (nextMiddleware) =>
		createWebRouterBuilder(contract, [
			...middlewares,
			nextMiddleware as WebRouteMiddleware<
				TRuntimeContext,
				Record<string, unknown>,
				TRequest,
				Record<string, unknown>
			>,
		]) as never,
	handlers: (handlers) =>
		serverRouter(contract, handlers as never, {
			createRouteImplementation: ({ route, handler }) =>
				attachMiddleware(
					{ route: route as HttpRouteDeclaration, handler },
					middlewares,
				),
		}) as ImplementationTreeFor<TContract, HttpRouteDeclaration> &
			WebImplementationTree,
});
