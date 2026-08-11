import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	ContractResponseError,
	type ImplementationShape,
	type ImplementationTree,
	type ImplementationTreeFor,
	type InferRouteHandlerRequest,
	type InferRouteHandlerResponse,
	type RequestValidationErrorInput,
	type RouteHandler,
	type RouteHandlerFor,
	type RouteImplementation,
	type ServerErrorHandlers,
	type ServerErrorResponse,
	route as serverRoute,
	router as serverRouter,
	routes as serverRoutes,
	type UnhandledErrorInput,
} from "@rest-rpc/server";
import {
	type CreateWebHandlerOptions,
	defaultParseBody,
	handleWebRoute,
	type WebHandler,
	type WebRouteHandlerContext,
} from "./http.ts";
import { createWebRouteMatcher } from "./match.ts";

export type {
	CreateWebHandlerOptions,
	WebHandler,
	WebRequestHandler,
	WebRouteHandlerContext,
	WebRouteParseBody,
	WebRouteParseBodyInput,
} from "./http.ts";
export type {
	InferRouteHandlerRequest,
	InferRouteHandlerResponse,
	RequestValidationErrorInput,
	RouteHandler,
	ServerErrorHandlers,
	ServerErrorResponse,
	UnhandledErrorInput,
};
export { ContractResponseError };

export type WebContract = Contract<HttpRouteDeclaration>;

export type WebRouterHandlers<
	TContract extends WebContract,
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
> = ImplementationShape<TContract, TContext>;

export const route = <
	const TRoute extends HttpRouteDeclaration,
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
>(
	contract: TRoute,
	handler: RouteHandler<TRoute, TContext>,
): RouteImplementation<TRoute> =>
	serverRoute(contract, handler as RouteHandlerFor<TRoute, TContext, TContext>);

export const router = <
	const TContract extends WebContract,
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
>(
	contract: TContract,
	handlers: ImplementationShape<TContract, TContext>,
): ImplementationTreeFor<TContract, HttpRouteDeclaration> =>
	serverRouter(contract, handlers) as ImplementationTreeFor<
		TContract,
		HttpRouteDeclaration
	>;

export const routes = <const TContract extends WebContract>(
	contract: TContract,
	implementations: ImplementationTreeFor<TContract, HttpRouteDeclaration>,
): ImplementationTreeFor<TContract, HttpRouteDeclaration> =>
	serverRoutes(
		contract,
		implementations as ImplementationTreeFor<TContract>,
	) as ImplementationTreeFor<TContract, HttpRouteDeclaration>;

export const createHandler = <
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
>(
	implementations: ImplementationTree<HttpRouteDeclaration>,
	options: CreateWebHandlerOptions<TContext> = {},
): WebHandler<TContext> => {
	const matchRoute = createWebRouteMatcher(implementations);
	const parseBody = options.parseBody ?? defaultParseBody;

	return (async (request: Request, context?: TContext) => {
		const match = matchRoute(request);
		if (!match) return new Response(null, { status: 404 });

		return handleWebRoute(
			request,
			(context ?? {}) as TContext,
			match.implementation,
			match.params,
			parseBody,
			options.errorHandlers,
		);
	}) as WebHandler<TContext>;
};

export const initWeb = <
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
>() => {
	return {
		route: <const TRoute extends HttpRouteDeclaration>(
			contract: TRoute,
			handler: RouteHandler<TRoute, TContext>,
		) => route<TRoute, TContext>(contract, handler),
		router: <const TContract extends WebContract>(
			contract: TContract,
			handlers: ImplementationShape<TContract, TContext>,
		) => router<TContract, TContext>(contract, handlers),
		routes,
		createHandler: (
			implementations: ImplementationTree<HttpRouteDeclaration>,
			options?: CreateWebHandlerOptions<TContext>,
		) => createHandler<TContext>(implementations, options),
	};
};
