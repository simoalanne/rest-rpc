import type { AbsolutePath, BodyCodec } from "@rest-rpc/core";
import { defaultBodyCodecs } from "@rest-rpc/core/codecs";
import type { HttpMethod } from "@rest-rpc/core/contract";
import {
	assertPathParams,
	createRouteMatcher,
	flattenRouteImplementations,
	readPathParams,
	resolveImplementationPath,
	type RuntimeImplementation,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import { assertRequestContentType } from "./requestContentType.ts";
import { handleHttpRoute, type HandleOptions } from "./handleHttpRoute.ts";
import { RequestValidationError, ResponseValidationError } from "./errors.ts";
import {
	assertRequestBodyLimit,
	deserializeRequestBody,
} from "./deserializeRequestBody.ts";
import { serializeHttpRouteResult } from "./serializeHttpRouteResult.ts";
import { splitRequestUrl } from "../routing/requestUrl.ts";

/**
 * Customizes paths, request parsing and validation failures for compiled Fetch routes.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#options}
 */
export type CompileRoutesOptions = {
	bodyCodecs?: readonly BodyCodec[];
	/** Path prefix to apply to all routes in the route tree. */
	prefix?: AbsolutePath;
	/**
	 * Rewrites param markers in compiled paths to `:name` (`"colon"`) or
	 * `{name}` (`"braces"`). Declared markers are kept when omitted.
	 */
	paramSyntax?: "colon" | "braces";
	/** The maximum accepted size of the request body in bytes. */
	requestBodyLimit?: number;
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
	/**
	 * When set to `true`, disables request schema validation. Handlers receive
	 * the declared request segments without schema validation. The schemas are
	 * still used for type inference and OpenAPI generation.
	 *
	 * @remarks Do not disable request validation if you are using schemas that
	 * transform or coerce values, as those transformations will not be applied to
	 * the request segments. See {@link https://rest-rpc.vercel.app/docs/http-behavior/schemas#disabling-server-validation}.
	 *
	 * @default false
	 */
	disableRequestValidation?: boolean;
	/**
	 * When set to `true`, disables response schema validation. Validation errors
	 * will not be thrown, and the handler's output will be returned as-is.
	 * The schemas are still used for type inference and OpenAPI generation.
	 *
	 * @remarks Do not disable response validation if you are using schemas that
	 * transform or coerce values, as those transformations will not be applied to
	 * the response body. See {@link https://rest-rpc.vercel.app/docs/http-behavior/schemas#disabling-server-validation}.
	 *
	 * @default false
	 */
	disableResponseValidation?: boolean;
};

/**
 * Defines the Fetch response returned when a request fails validation.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: Request,
) => Response | Promise<Response>;

/**
 * Defines the Fetch response returned when handler output fails validation.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: Request,
) => Response | Promise<Response>;

/**
 * Result of dispatching a request with the Fetch catch-all handler.
 *
 * @remarks `matched` is `false` when no route matches, so the surrounding
 * runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#usage}
 */
export type FetchRouteHandlerResult =
	| { matched: true; response: Response }
	| { matched: false; response: undefined };

/**
 * A compiled route ready to be registered on a router.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#routes}
 */
export type FetchRoute = {
	readonly method: HttpMethod;
	/** Route path with prefix applied and param markers per `paramSyntax`. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route. Params are read from the
	 * request URL unless passed in `options`.
	 */
	readonly handle: (
		request: Request,
		options?: HandleOptions,
	) => Promise<Response>;
};

type FetchDispatch = (
	implementation: RuntimeImplementation,
	params: Record<string, string> | undefined,
	request: Request,
	search: string,
	options: HandleOptions | undefined,
) => Promise<Response>;

const createFetchDispatch = (options: CompileRoutesOptions): FetchDispatch => {
	const bodyCodecs = options.bodyCodecs ?? [];
	const requestBodyCodecs = [...bodyCodecs, ...defaultBodyCodecs];
	const maxBytes = options.requestBodyLimit;
	assertRequestBodyLimit(maxBytes);

	return async (implementation, params, request, search, handleOptions) => {
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
			requestBodyCodecs,
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
			query: search,
			headers: Object.fromEntries(request.headers),
			body,
		};

		const result = await handleHttpRoute(implementation, {
			configuration: {
				disableRequestValidation: options.disableRequestValidation,
				disableResponseValidation: options.disableResponseValidation,
			},
			request: parsedRequest,
			signal: request.signal,
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

		return serializeHttpRouteResult(result, bodyCodecs);
	};
};

/**
 * Compiles a route tree into Fetch routes to register on a router.
 *
 * @remarks Pass the result to {@link createCatchAllHandler} to let rest-rpc
 * do the routing instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#routes}
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
		return {
			method: implementation.route.method,
			path,
			handle: async (request, handleOptions) => {
				const { pathname, search } = splitRequestUrl(request.url);
				let params: Record<string, string> | undefined;
				if (implementation.route.request?.params) {
					params = handleOptions?.params
						? assertPathParams(path, handleOptions.params)
						: readPathParams(path, pathname);
				}
				return dispatch(implementation, params, request, search, handleOptions);
			},
		};
	});
}

/**
 * Creates a Fetch catch-all handler that routes requests to compiled routes.
 *
 * @remarks An unmatched request is returned to the caller with `matched: false`
 * so the surrounding runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch}
 */
export function createCatchAllHandler(
	routes: readonly FetchRoute[],
): (
	request: Request,
	options?: HandleOptions,
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(routes);

	return async (request, options) => {
		const route = matchRoute(
			request.method,
			splitRequestUrl(request.url).pathname,
		);
		if (!route) {
			return { matched: false, response: undefined };
		}

		return { matched: true, response: await route.handle(request, options) };
	};
}
