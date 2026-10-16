import type { AbsolutePath, BodyCodec } from "@rest-rpc/core";
import type { HttpMethod } from "@rest-rpc/core/contract";
import {
	createPathParamsReader,
	createRouteMatcher,
	flattenRouteImplementations,
	resolveImplementationPath,
	type ParamSyntax,
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type DefaultContext,
	type HandleHttpRouteConfiguration,
	type RuntimeImplementation,
	type RuntimeImplementationTree,
} from "../index.ts";

import {
	assertRequestBodyLimit,
	deserializeRequestBody,
} from "./deserializeRequestBody.ts";
import { createFetchResponse } from "./response.ts";

/**
 * Customizes paths, request parsing and validation failures for compiled Fetch routes.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#options}
 */
export type CompileRoutesOptions = {
	bodyCodecs?: readonly BodyCodec[];
	/** Path prefix to apply to all routes in the route tree. */
	prefix?: AbsolutePath;
	/**
	 * Rewrites param markers in compiled paths to `:name` (`"colon"`) or
	 * `{name}` (`"braces"`). Declared markers are kept when omitted.
	 */
	paramSyntax?: ParamSyntax;
	/** The maximum accepted size of the request body in bytes. */
	requestBodyLimit?: number;
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
} & HandleHttpRouteConfiguration;

/**
 * Defines the Fetch response returned when a request fails validation.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: Request,
) => Response | Promise<Response>;

/**
 * Defines the Fetch response returned when handler output fails validation.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: Request,
) => Response | Promise<Response>;

/**
 * Per-request options for compiled Fetch routes and the catch-all handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#context}
 */
export type HandleOptions = {
	/** Initial context values, set before middleware runs. */
	context?: Partial<DefaultContext>;
};

/**
 * Result of dispatching a request with the Fetch catch-all handler.
 *
 * @remarks `matched` is `false` when no route matches, so the surrounding
 * runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#usage}
 */
export type FetchRouteHandlerResult =
	| { matched: true; response: Response }
	| { matched: false; response: undefined };

/**
 * A compiled route ready to be registered on a router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#routes}
 */
export type FetchRoute = {
	readonly method: HttpMethod;
	/** Route path with prefix applied and param markers per `paramSyntax`. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route. Params are read from the
	 * request URL.
	 */
	readonly handle: (
		request: Request,
		options?: HandleOptions,
	) => Promise<Response>;
};

type FetchDispatch = (
	implementation: RuntimeImplementation,
	params: Record<string, string>,
	request: Request,
	url: URL,
	options: HandleOptions | undefined,
) => Promise<Response>;

type MatchedDispatch = (
	params: Record<string, string>,
	request: Request,
	url: URL,
	options: HandleOptions | undefined,
) => Promise<Response>;

// Lets the catch-all dispatch with params it already matched.
const matchedDispatches = new WeakMap<FetchRoute, MatchedDispatch>();

const createFetchDispatch = (options: CompileRoutesOptions): FetchDispatch => {
	const bodyCodecs = options.bodyCodecs ?? [];
	const maxBytes = options.requestBodyLimit;
	assertRequestBodyLimit(maxBytes);

	return async (implementation, params, request, url, handleOptions) => {
		const rejection = assertRequestContentType(
			implementation.route,
			request.headers.get("content-type"),
		);
		if (rejection) {
			return Response.json(
				{ message: rejection.message },
				{ status: rejection.status },
			);
		}

		const { body, rejection: bodyRejection } = await deserializeRequestBody(
			request,
			bodyCodecs,
			maxBytes,
		);
		if (bodyRejection) {
			return Response.json(
				{ message: bodyRejection.message },
				{ status: bodyRejection.status },
			);
		}
		const parsedRequest = {
			params,
			query: url.searchParams,
			headers: Object.fromEntries(request.headers),
			body,
		};

		const result = await handleHttpRoute(implementation, {
			configuration: {
				disableRequestValidation: options.disableRequestValidation,
				disableResponseValidation: options.disableResponseValidation,
			},
			request: parsedRequest,
			handlerFields: { signal: request.signal },
			context: handleOptions?.context,
		});
		if (result instanceof RequestValidationError) {
			return options.requestValidationErrorHandler
				? options.requestValidationErrorHandler(result, request)
				: Response.json(result.responseBody, { status: result.status });
		}

		if (result instanceof ResponseValidationError) {
			return options.responseValidationErrorHandler
				? options.responseValidationErrorHandler(result, request)
				: Response.json(result.responseBody, { status: result.status });
		}

		return createFetchResponse(result, bodyCodecs);
	};
};

/**
 * Compiles a route tree into Fetch routes to register on a router.
 *
 * @remarks Pass the result to {@link createCatchAllHandler} to let rest-rpc
 * do the routing instead.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#routes}
 */
export function compileRoutes(
	implementations: RuntimeImplementationTree,
	options: CompileRoutesOptions = {},
): FetchRoute[] {
	const dispatch = createFetchDispatch(options);

	return flattenRouteImplementations(implementations).map((implementation) => {
		const path = resolveImplementationPath(
			implementation.route.path,
			options.prefix,
			options.paramSyntax,
		);
		const readParams = createPathParamsReader(path);
		const dispatchMatched: MatchedDispatch = (
			params,
			request,
			url,
			handleOptions,
		) => dispatch(implementation, params, request, url, handleOptions);
		const route: FetchRoute = {
			method: implementation.route.method,
			path,
			handle: async (request, handleOptions) => {
				const url = new URL(request.url);
				const params = readParams(url.pathname);
				if (!params) {
					throw new Error(
						`Request path "${url.pathname}" does not match route "${implementation.route.method} ${path}".`,
					);
				}
				return dispatchMatched(params, request, url, handleOptions);
			},
		};
		matchedDispatches.set(route, dispatchMatched);
		return route;
	});
}

/**
 * Creates a Fetch catch-all handler that routes requests to compiled routes.
 *
 * @remarks An unmatched request is returned to the caller with `matched: false`
 * so the surrounding runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export function createCatchAllHandler(
	routes: readonly FetchRoute[],
): (
	request: Request,
	options?: HandleOptions,
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(routes);

	return async (request, options) => {
		const url = new URL(request.url);
		const matched = matchRoute(request.method, url.pathname);
		if (!matched) {
			return { matched: false, response: undefined };
		}

		const dispatchMatched = matchedDispatches.get(matched.route);
		return {
			matched: true,
			response: dispatchMatched
				? await dispatchMatched(matched.params, request, url, options)
				: await matched.route.handle(request, options),
		};
	};
}
