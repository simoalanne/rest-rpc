import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	clearCookie,
	RouteResponseError,
	type ServerErrorHandlers,
	setCookie,
} from "@rest-rpc/server";
import {
	defaultParseBody,
	handleWebRoute,
	type WebRouteParseBody,
} from "./http.ts";
import { createWebRouteMatcher } from "./match.ts";
import {
	createWebRouteBuilder,
	createWebRouterBuilder,
	type WebContract,
	type WebImplementationTree,
	type WebRouteBuilder,
	type WebRouteImplementation,
	type WebRouterBuilder,
} from "./routeBuilder.ts";

export type {
	ClearCookieOptions,
	RouteErrors,
	RouteHandler,
	RouteRequestData,
	RouteResponse,
	RouteResponseShorthand,
	SetCookieOptions,
} from "@rest-rpc/server";
export type { WebRouteParseBody, WebRouteParseBodyInput } from "./http.ts";
export type {
	RouteRequest,
	WebContract,
	WebImplementationTree,
	WebRouteBuilder,
	WebRouteContext,
	WebRouteMiddleware,
	WebRouteMiddlewareInput,
	WebRouteMiddlewareResult,
	WebRouterBuilder,
} from "./routeBuilder.ts";
export { clearCookie, RouteResponseError, setCookie };

/**
 * Options for creating a Web `Request` to `Response` route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#options}
 */
export type CreateWebHandlerOptions = {
	errorHandlers?: ServerErrorHandlers<Record<never, never>>;
	parseBody?: WebRouteParseBody;
};

/**
 * Creates a fluent Web route builder for a single HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export function route<
	const TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown> = Record<never, never>,
	TRequest extends Request = Request,
>(contract: TRoute): WebRouteBuilder<TRoute, TRuntimeContext, TRequest> {
	return createWebRouteBuilder(contract);
}

/**
 * Creates a fluent Web router builder for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export function router<
	const TContract extends WebContract,
	TRuntimeContext extends Record<string, unknown> = Record<never, never>,
	TRequest extends Request = Request,
>(contract: TContract): WebRouterBuilder<TContract, TRuntimeContext, TRequest> {
	return createWebRouterBuilder(contract);
}

/**
 * Creates a Web `Request` handler from route implementations.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export function createRouteHandler<
	TRuntimeContext extends Record<string, unknown> = Record<never, never>,
	TContext extends Record<string, unknown> = Record<string, unknown>,
	TRequest extends Request = Request,
>(
	implementations: WebImplementationTree,
	options: CreateWebHandlerOptions = {},
): (request: TRequest, runtime: TRuntimeContext) => Promise<Response> {
	const matchRoute = createWebRouteMatcher(implementations);
	const usesDefaultParseBody = options.parseBody === undefined;
	const parseBody = options.parseBody ?? defaultParseBody;

	return async (request: TRequest, runtime: TRuntimeContext) => {
		const match = matchRoute(request);
		if (match instanceof Response) return match;
		const implementation = match.implementation as WebRouteImplementation<
			TRuntimeContext,
			TContext,
			TRequest
		>;
		const middlewareResult = await implementation.middleware?.({
			request,
			route: implementation.route,
			runtime,
		});
		if (middlewareResult instanceof Response) return middlewareResult;

		const context = {
			...(middlewareResult ?? {}),
			request,
		};

		return handleWebRoute(
			request,
			context,
			implementation,
			match.params,
			parseBody,
			usesDefaultParseBody,
			options.errorHandlers,
		);
	};
}

/**
 * Creates typed Web adapter helpers with shared runtime context types.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export function initWeb<
	TRuntimeContext extends Record<string, unknown> = Record<never, never>,
	TRequest extends Request = Request,
>() {
	return {
		route: <const TRoute extends HttpRouteDeclaration>(contract: TRoute) =>
			route<TRoute, TRuntimeContext, TRequest>(contract),
		router: <const TContract extends WebContract>(contract: TContract) =>
			router<TContract, TRuntimeContext, TRequest>(contract),
		createRouteHandler: <TContext extends Record<string, unknown>>(
			implementations: WebImplementationTree,
			options?: CreateWebHandlerOptions,
		) =>
			createRouteHandler<TRuntimeContext, TContext, TRequest>(
				implementations,
				options,
			),
	};
}
