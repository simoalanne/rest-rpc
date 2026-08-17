import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	ContractResponseError,
	clearCookie,
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
	routes as serverRoutes,
	setCookie,
} from "@rest-rpc/server";
import {
	type CreateWebHandlerOptions,
	defaultParseBody,
	handleWebRoute,
	type WebHandler,
	type WebRouteHandlerContext,
	type WebRouteRuntimeContext,
} from "./http.ts";
import { createWebRouteMatcher } from "./match.ts";

export type {
	ClearCookieOptions,
	CookiePriority,
	SameSite,
	SetCookieOptions,
} from "@rest-rpc/server";
export type {
	CreateWebHandlerOptions,
	WebRouteHandlerContext,
	WebRouteParseBody,
	WebRouteParseBodyInput,
	WebRouteRuntimeContext,
} from "./http.ts";
export type { RouteHandler };
export { ContractResponseError, clearCookie, setCookie };

type WebContract = Contract<HttpRouteDeclaration>;

export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
> = ServerInferRouteHandlerRequest<E, WebRouteRuntimeContext<TContext>>;

export type RouteResponse<E extends HttpRouteDeclaration> =
	ServerInferRouteHandlerResponse<E>;

export const route = <
	const TRoute extends HttpRouteDeclaration,
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
>(
	contract: TRoute,
	handler: RouteHandler<TRoute, WebRouteRuntimeContext<TContext>>,
): RouteImplementation<TRoute> =>
	serverRoute(contract, handler as RouteHandlerFor<TRoute, TContext, TContext>);

export const router = <
	const TContract extends WebContract,
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
>(
	contract: TContract,
	handlers: ImplementationShape<TContract, WebRouteRuntimeContext<TContext>>,
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
		if (match.type === "methodNotAllowed") {
			return new Response(null, { status: 405 });
		}

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
			handler: RouteHandler<TRoute, WebRouteRuntimeContext<TContext>>,
		) => route<TRoute, TContext>(contract, handler),
		router: <const TContract extends WebContract>(
			contract: TContract,
			handlers: ImplementationShape<
				TContract,
				WebRouteRuntimeContext<TContext>
			>,
		) => router<TContract, TContext>(contract, handlers),
		routes,
		createHandler: (
			implementations: ImplementationTree<HttpRouteDeclaration>,
			options?: CreateWebHandlerOptions<TContext>,
		) => createHandler<TContext>(implementations, options),
	};
};
