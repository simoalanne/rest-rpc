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
	RouteHandlers,
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
 * Default runtime context passed to Web route handlers.
 *
 * @remarks Augment this interface to set the runtime context for
 * `createRouteHandler()`, `route()`, and `router()` across a project.
 *
 * @example
 * ```ts
 * declare module "@rest-rpc/web" {
 *   interface DefaultRuntimeContext {
 *     env: Env;
 *     ctx: ExecutionContext;
 *   }
 * }
 * ```
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export interface DefaultRuntimeContext extends Record<string, unknown> {}

/**
 * Default request type passed to Web route handlers.
 *
 * @remarks Augment this interface when using a `Request` subclass such as
 * `NextRequest`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#framework-context}
 */
export interface DefaultRequest extends Request {}

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
 * Creates a Web route implementation builder for a single HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export function route<
	const TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends Record<string, unknown> = DefaultRuntimeContext,
	TRequest extends Request = DefaultRequest,
>(contract: TRoute): WebRouteBuilder<TRoute, TRuntimeContext, TRequest> {
	return createWebRouteBuilder(contract);
}

/**
 * Creates a Web router implementation builder for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export function router<
	const TContract extends WebContract,
	TRuntimeContext extends Record<string, unknown> = DefaultRuntimeContext,
	TRequest extends Request = DefaultRequest,
>(contract: TContract): WebRouterBuilder<TContract, TRuntimeContext, TRequest> {
	return createWebRouterBuilder(contract);
}

/**
 * Creates a Web `Request` handler from route implementations.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web}
 */
export function createRouteHandler<
	TRuntimeContext extends Record<string, unknown> = DefaultRuntimeContext,
	TRequest extends Request = DefaultRequest,
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
			TRequest
		>;
		let middlewareContext: Record<string, unknown> = {};
		for (const middleware of implementation.middleware ?? []) {
			const middlewareResult = await middleware({
				context: middlewareContext,
				request,
				route: implementation.route,
				runtime,
			});
			if (middlewareResult instanceof Response) return middlewareResult;
			middlewareContext = {
				...middlewareContext,
				...middlewareResult,
			};
		}

		const context = {
			...middlewareContext,
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
