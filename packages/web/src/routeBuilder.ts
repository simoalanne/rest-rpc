import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	type ImplementationShape,
	type ImplementationTree,
	type ImplementationTreeFor,
	type RouteHandler,
	type RouteHandlerFor,
	type RouteImplementation,
	type InferRouteHandlerRequest as ServerInferRouteHandlerRequest,
	type InferRouteHandlerResponse as ServerInferRouteHandlerResponse,
	route as serverRoute,
	router as serverRouter,
} from "@rest-rpc/server";

type MaybePromise<T> = T | Promise<T>;

export type WebContract = Contract<HttpRouteDeclaration>;

export type WebImplementationTree = ImplementationTree<HttpRouteDeclaration>;

export type WebRouteContext<
	TContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = TContext & {
	request: TRequest;
};

export type WebRouteMiddlewareInput<
	TRuntimeContext extends Record<string, unknown>,
	TRequest extends Request = Request,
> = {
	request: TRequest;
	route: HttpRouteDeclaration;
	runtime: TRuntimeContext;
};

export type WebRouteMiddlewareResult<TContext extends Record<string, unknown>> =
	| Response
	| TContext
	| undefined;

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

export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<string, unknown>,
	TRequest extends Request = Request,
> = ServerInferRouteHandlerRequest<E, WebRouteContext<TContext, TRequest>>;

export type RouteResponse<E extends HttpRouteDeclaration> =
	ServerInferRouteHandlerResponse<E>;

type WebRouteBuilderWithMiddleware<
	TRoute extends HttpRouteDeclaration,
	TContext extends Record<string, unknown>,
	TRequest extends Request,
> = {
	handler(
		handler: RouteHandler<TRoute, WebRouteContext<TContext, TRequest>>,
	): RouteImplementation<TRoute> & WebImplementationTree;
};

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
		handlers: ImplementationShape<
			TContract,
			WebRouteContext<TContext, TRequest>
		>,
	): ImplementationTreeFor<TContract, HttpRouteDeclaration> &
		WebImplementationTree;
};

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
			serverRoute(
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
			serverRouter(contract, handlers) as ImplementationTreeFor<
				TContract,
				HttpRouteDeclaration
			>,
			middleware,
		) as ImplementationTreeFor<TContract, HttpRouteDeclaration> &
			WebImplementationTree,
});
