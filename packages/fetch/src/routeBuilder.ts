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
 * A contract tree containing only HTTP routes for the Fetch runtime.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export type FetchContract = Contract<HttpRouteDeclaration>;

/**
 * An HTTP-only implementation tree for the Fetch runtime.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export type FetchImplementationTree = ImplementationTree<HttpRouteDeclaration>;

/**
 * The context object passed to Fetch runtime route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#framework-context}
 */
export type FetchRouteContext<
	TContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = Merge<
	TContext & {
		request: TRequest;
	}
>;

/**
 * Input passed to Fetch runtime middleware.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#framework-context}
 */
export type FetchRouteMiddlewareInput<
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
 * Result returned by Fetch runtime middleware.
 *
 * @remarks Returning a `Response` short-circuits the route handler.
 * @see {@link https://rest-rpc.dev/docs/server/fetch#framework-context}
 */
export type FetchRouteMiddlewareResult<
	TContext extends Record<string, unknown>,
> = Response | TContext | undefined;

/**
 * Middleware function shape for Fetch runtime routes.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#framework-context}
 */
export type FetchRouteMiddleware<
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TInputContext extends Record<string, unknown> = Record<never, never>,
> = (
	input: FetchRouteMiddlewareInput<TRuntimeContext, TRequest, TInputContext>,
) => MaybePromise<FetchRouteMiddlewareResult<TContext>>;

export type FetchRouteImplementation<
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = RouteImplementation<HttpRouteDeclaration> & {
	middleware?: FetchRouteMiddleware<
		TRuntimeContext,
		Record<string, unknown>,
		TRequest,
		Record<string, unknown>
	>[];
};

/**
 * Infers the Fetch runtime route handler request type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<string, unknown>,
	TRequest extends Request = Request,
> = ServerRouteRequest<E, FetchRouteContext<TContext, TRequest>>;

/**
 * Handler tree accepted by `router().handlers()` when building a Fetch runtime implementation tree.
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
export type RouteHandlers<
	TContract extends FetchContract,
	TContext extends Record<string, unknown> = Record<string, unknown>,
	TRequest extends Request = Request,
> = ServerRouteHandlers<
	TContract,
	FetchRouteContext<TContext, TRequest>,
	Record<never, never>
>;

type FetchRouteBuilderWithMiddleware<
	TRoute extends HttpRouteDeclaration,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = {
	handler(
		handler: RouteHandler<TRoute, FetchRouteContext<TContext, TRequest>>,
	): RouteImplementation<TRoute> & FetchImplementationTree;
};

/**
 * Builder for a single Fetch runtime route implementation.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export type FetchRouteBuilder<
	TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = FetchRouteBuilderWithStackedMiddleware<
	TRoute,
	TRuntimeContext,
	Record<never, never>,
	TRequest
>;

type FetchRouterBuilderWithMiddleware<
	TContract extends FetchContract,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = {
	handlers(
		handlers: RouteHandlers<TContract, TContext, TRequest>,
	): ImplementationTreeFor<TContract, HttpRouteDeclaration> &
		FetchImplementationTree;
};

/**
 * Builder for a Fetch runtime implementation tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export type FetchRouterBuilder<
	TContract extends FetchContract,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = FetchRouterBuilderWithMiddleware<
	TContract,
	Record<never, never>,
	TRequest
> &
	FetchRouterBuilderWithStackedMiddleware<
		TContract,
		TRuntimeContext,
		Record<never, never>,
		TRequest
	>;

type FetchRouteBuilderWithStackedMiddleware<
	TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = FetchRouteBuilderWithMiddleware<TRoute, TContext, TRequest> & {
	middleware<TNextContext extends Record<string, unknown>>(
		middleware: FetchRouteMiddleware<
			TRuntimeContext,
			TNextContext,
			TRequest,
			TContext
		>,
	): FetchRouteBuilderWithStackedMiddleware<
		TRoute,
		TRuntimeContext,
		MergeContext<TContext, TNextContext>,
		TRequest
	>;
};

type FetchRouterBuilderWithStackedMiddleware<
	TContract extends FetchContract,
	TRuntimeContext extends Record<string, unknown>,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = FetchRouterBuilderWithMiddleware<TContract, TContext, TRequest> & {
	middleware<TNextContext extends Record<string, unknown>>(
		middleware: FetchRouteMiddleware<
			TRuntimeContext,
			TNextContext,
			TRequest,
			TContext
		>,
	): FetchRouterBuilderWithStackedMiddleware<
		TContract,
		TRuntimeContext,
		MergeContext<TContext, TNextContext>,
		TRequest
	>;
};

const attachMiddleware = <
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request,
	TImplementation extends FetchImplementationTree,
>(
	implementation: TImplementation,
	middleware:
		| FetchRouteMiddleware<
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
			attachMiddleware(child as FetchImplementationTree, middleware),
		]),
	) as TImplementation;
};

export const createFetchRouteBuilder = <
	const TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TContext extends Record<string, unknown> = Record<never, never>,
>(
	contract: TRoute,
	middlewares: FetchRouteMiddleware<
		TRuntimeContext,
		Record<string, unknown>,
		TRequest,
		Record<string, unknown>
	>[] = [],
): FetchRouteBuilder<TRoute, TRuntimeContext, TRequest> &
	FetchRouteBuilderWithStackedMiddleware<
		TRoute,
		TRuntimeContext,
		TContext,
		TRequest
	> => ({
	middleware: (nextMiddleware) =>
		createFetchRouteBuilder(contract, [
			...middlewares,
			nextMiddleware as FetchRouteMiddleware<
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
				FetchRouteContext<TContext, TRequest>,
				Record<never, never>
			>(
				contract,
				handler as RouteHandlerFor<
					TRoute,
					FetchRouteContext<TContext, TRequest>
				>,
			),
			middlewares,
		) as RouteImplementation<TRoute> & FetchImplementationTree,
});

export const createFetchRouterBuilder = <
	const TContract extends FetchContract,
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
	TContext extends Record<string, unknown> = Record<never, never>,
>(
	contract: TContract,
	middlewares: FetchRouteMiddleware<
		TRuntimeContext,
		Record<string, unknown>,
		TRequest,
		Record<string, unknown>
	>[] = [],
): FetchRouterBuilder<TContract, TRuntimeContext, TRequest> &
	FetchRouterBuilderWithStackedMiddleware<
		TContract,
		TRuntimeContext,
		TContext,
		TRequest
	> => ({
	middleware: (nextMiddleware) =>
		createFetchRouterBuilder(contract, [
			...middlewares,
			nextMiddleware as FetchRouteMiddleware<
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
			FetchImplementationTree,
});
