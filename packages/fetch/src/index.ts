import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	clearCookie,
	RouteResponseError,
	type ServerErrorHandlers,
	setCookie,
	sseEvent,
} from "@rest-rpc/server";
import {
	defaultParseBody,
	handleFetchRoute,
	type FetchRouteParseBody,
} from "./http.ts";
import { createFetchRouteMatcher } from "./match.ts";
import {
	createFetchRouteBuilder,
	createFetchRouterBuilder,
	type FetchContract,
	type FetchImplementationTree,
	type FetchRouteBuilder,
	type FetchRouteImplementation,
	type FetchRouterBuilder,
} from "./routeBuilder.ts";

export type {
	ClearCookieOptions,
	RouteErrors,
	RouteHandler,
	RouteRequestData,
	RouteResponse,
	RouteResponseShorthand,
	SetCookieOptions,
	SseEvent,
} from "@rest-rpc/server";
export type { FetchRouteParseBody, FetchRouteParseBodyInput } from "./http.ts";
export type {
	RouteHandlers,
	RouteRequest,
	FetchContract,
	FetchImplementationTree,
	FetchRouteBuilder,
	FetchRouteContext,
	FetchRouteMiddleware,
	FetchRouteMiddlewareInput,
	FetchRouteMiddlewareResult,
	FetchRouterBuilder,
} from "./routeBuilder.ts";
export { clearCookie, RouteResponseError, setCookie, sseEvent };

/**
 * Default runtime context passed to Fetch runtime route handlers.
 *
 * @remarks Augment this interface to set the runtime context for
 * `createRouteHandler()`, `route()`, and `router()` across a project.
 *
 * @example
 * ```ts
 * declare module "@rest-rpc/fetch" {
 *   interface DefaultRuntimeContext {
 *     env: Env;
 *     ctx: ExecutionContext;
 *   }
 * }
 * ```
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#framework-context}
 */
export interface DefaultRuntimeContext {}

interface ContextShape {
	// oxlint-disable-next-line typescript/no-explicit-any -- `any` allows named interfaces without leaking an index signature.
	[key: string]: any;
}

/**
 * Default request type passed to Fetch runtime route handlers.
 *
 * @remarks Augment this interface when using a `Request` subclass such as
 * `NextRequest`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#framework-context}
 */
export interface DefaultRequest extends Request {}

/**
 * Options for creating a Fetch runtime `Request` to `Response` route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#options}
 */
export type CreateFetchHandlerOptions = {
	errorHandlers?: ServerErrorHandlers<Record<never, never>>;
	parseBody?: FetchRouteParseBody;
};

/**
 * Creates a Fetch runtime route implementation builder for a single HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export function route<
	const TRoute extends HttpRouteDeclaration,
	TRuntimeContext extends ContextShape = DefaultRuntimeContext,
	TRequest extends Request = DefaultRequest,
>(contract: TRoute): FetchRouteBuilder<TRoute, TRuntimeContext, TRequest> {
	return createFetchRouteBuilder(contract);
}

/**
 * Creates a Fetch runtime router implementation builder for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export function router<
	const TContract extends FetchContract,
	TRuntimeContext extends ContextShape = DefaultRuntimeContext,
	TRequest extends Request = DefaultRequest,
>(
	contract: TContract,
): FetchRouterBuilder<TContract, TRuntimeContext, TRequest> {
	return createFetchRouterBuilder(contract);
}

/**
 * Creates a Fetch runtime `Request` handler from route implementations.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export function createRouteHandler<
	TRuntimeContext extends ContextShape = DefaultRuntimeContext,
	TRequest extends Request = DefaultRequest,
>(
	implementations: FetchImplementationTree,
	options: CreateFetchHandlerOptions = {},
): (request: TRequest, runtime: TRuntimeContext) => Promise<Response> {
	const matchRoute = createFetchRouteMatcher(implementations);
	const usesDefaultParseBody = options.parseBody === undefined;
	const parseBody = options.parseBody ?? defaultParseBody;

	return async (request: TRequest, runtime: TRuntimeContext) => {
		const match = matchRoute(request);
		if (match instanceof Response) return match;
		const implementation = match.implementation as FetchRouteImplementation<
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

		return handleFetchRoute(
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
