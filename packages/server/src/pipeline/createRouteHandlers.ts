import { RouteError, type AbsolutePath, type BodyCodec } from "@rest-rpc/core";
import {
	createBodyCodecRegistry,
	normalizeMediaType,
	type BodyCodecRegistry,
} from "@rest-rpc/core/codecs";
import type { HttpMethod } from "@rest-rpc/core/contract";
import type { EmptyObject } from "@rest-rpc/core/utils";
import {
	assertPathParams,
	createRouteMatcher,
	flattenRouteImplementations,
	parsePathParams,
	readAttachedPathParams,
	readPathParams,
	type PathParams,
	resolveImplementationPath,
	type RuntimeImplementation,
	type RuntimeImplementationTree,
	type TreeInitialContext,
} from "../routing/match.ts";
import { resolveRequestMediaType } from "./requestContentType.ts";
import {
	executeRoute,
	toHttpRouteResult,
	type RouteResult,
} from "./handleHttpRoute.ts";
import { deserializeRequestBody } from "./deserializeRequestBody.ts";
import { observeError } from "./errors.ts";
import { resolveRouteError } from "./resolveRouteError.ts";
import {
	serializeHttpRouteResult,
	serializeRouteError,
} from "./serializeHttpRouteResult.ts";
import { parseQuery } from "./validation.ts";
import {
	readRequestPathname,
	readRequestSearch,
} from "../routing/requestUrl.ts";
import { sseBodyCodec } from "./sse.ts";
import { prepareStaticResponse } from "./staticResponse.ts";

/**
 * Customizes request parsing, validation and error observation of route
 * handlers and catch-all handlers.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#route-options}
 */
export type CreateRouteHandlersOptions = {
	bodyCodecs?: readonly BodyCodec[];
	/**
	 * Observes every error sent as an error response, and `RouteError`s that
	 * end a stream after its response started, such as stream item validation
	 * failures. It is not awaited, and errors it throws or rejects with are
	 * ignored, so it cannot change the response.
	 */
	onError?: (error: RouteError, request: Request) => void;
	/**
	 * When set to `true`, disables request schema validation. Handlers receive
	 * the defined request segments without schema validation. The schemas are
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
 * The `context` option of a route tree's handlers: required when its routes
 * require initial context.
 */
export type ContextOption<TContext extends object> = object extends TContext
	? {
			/** The initial context the routes require, provided before middleware runs. */
			context?: TContext;
		}
	: {
			/** The initial context the routes require, provided before middleware runs. */
			context: TContext;
		};

/**
 * Per-request options for compiled routes and the catch-all handler.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#handle-options}
 */
export type HandleOptions<TContext extends object = EmptyObject> =
	ContextOption<TContext> & {
		/**
		 * Percent-decoded path params, for requests whose URL does not contain the
		 * route path. When omitted, params a router set as `request.params`, as Bun
		 * and Express do, are used, or else they are read from the request URL.
		 */
		params?: Record<string, string>;
		/**
		 * An already decoded request body, such as one parsed by a framework's body
		 * parser. When the key is present, even as `undefined`, the request body is
		 * not read. The value is still validated against the route's body schema.
		 */
		body?: unknown;
	};

/**
 * Per-request options for the catch-all handler.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#mount-path}
 */
export type CatchAllHandleOptions<TContext extends object = EmptyObject> =
	HandleOptions<TContext> & {
		/**
		 * The path the catch-all handler is mounted at, such as `/api`. Requests
		 * outside it are unmatched, and it is removed from the request path before
		 * matching. Route paths do not include it.
		 */
		mountPath?: AbsolutePath;
	};

/** Options, which are required when the routes require initial context. */
export type OptionsArgs<
	TContext extends object,
	TOptions,
> = object extends TContext ? [options?: TOptions] : [options: TOptions];

/**
 * Result of dispatching a request with the Fetch catch-all handler.
 *
 * @remarks `matched` is `false` when no route matches, so the surrounding
 * runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export type FetchRouteHandlerResult =
	| { matched: true; response: Response }
	| { matched: false; response: undefined };

/**
 * A compiled route ready to be registered on a router.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export type FetchRoute<TContext extends object = EmptyObject> = {
	readonly method: HttpMethod;
	/** Route path with `:name` params. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route. Params and the body are
	 * read from the request unless passed in `options`.
	 */
	readonly handle: (
		request: Request,
		...options: OptionsArgs<TContext, HandleOptions<TContext>>
	) => Promise<Response>;
	/**
	 * The response of a route completed with `.static()`, for routers that
	 * serve a `Response` as is. It is `undefined` for other routes.
	 *
	 * @remarks It is the same object for every request, so call `handle` to
	 * send the response in other ways.
	 */
	readonly staticResponse?: Response;
};

type FetchDispatch = (
	implementation: RuntimeImplementation,
	pathParams: PathParams,
	request: Request,
	options: HandleOptions<object> | undefined,
) => Promise<Response>;

const createFetchDispatch = (
	options: CreateRouteHandlersOptions,
	codecs: BodyCodecRegistry,
): FetchDispatch => {
	const { disableRequestValidation, disableResponseValidation, onError } =
		options;
	const respondWithError = async (
		implementation: RuntimeImplementation,
		error: RouteError,
		request: Request,
	) => {
		const resolved = await resolveRouteError(
			implementation.route,
			error,
			disableResponseValidation ?? false,
		);
		observeError(onError, resolved, request);
		return serializeRouteError(resolved);
	};

	return async (implementation, pathParams, request, handleOptions) => {
		const schemas = implementation.route.request;
		// The URL is only read for the params of dynamic path segments and a
		// defined query, and params a router attached to the request are used
		// as-is.
		let params: Record<string, string> | undefined;
		if (pathParams.params.length > 0) {
			params = handleOptions?.params
				? assertPathParams(pathParams, handleOptions.params)
				: (readAttachedPathParams(pathParams, request) ??
					readPathParams(pathParams, readRequestPathname(request.url)));
		}

		// Routes without a body schema ignore the request body and its content type.
		let body: unknown;
		let mediaType: string | undefined;
		if (schemas?.body) {
			const receivedMediaType = normalizeMediaType(
				request.headers.get("content-type"),
			);
			const selected = resolveRequestMediaType(
				implementation,
				receivedMediaType,
			);
			if (selected instanceof RouteError) {
				return respondWithError(implementation, selected, request);
			}
			mediaType = selected;

			if (handleOptions && "body" in handleOptions) {
				body = handleOptions.body;
			} else {
				const deserialized = await deserializeRequestBody(
					request,
					receivedMediaType,
					codecs,
				);
				if (deserialized.rejection) {
					return respondWithError(
						implementation,
						deserialized.rejection,
						request,
					);
				}
				body = deserialized.body;
			}
		}

		let result: RouteResult;
		try {
			result = await executeRoute(implementation, {
				request: {
					params,
					query: schemas?.query?.length
						? parseQuery(readRequestSearch(request.url))
						: undefined,
					headers: schemas?.headers?.length
						? Object.fromEntries(request.headers)
						: undefined,
					body,
				},
				signal: request.signal,
				mediaType,
				context: handleOptions?.context,
				disableRequestValidation,
				disableResponseValidation,
			});
		} catch (error) {
			if (error instanceof RouteError) {
				return respondWithError(implementation, error, request);
			}
			throw error;
		}

		return serializeHttpRouteResult(
			toHttpRouteResult(
				result,
				onError && ((error) => observeError(onError, error, request)),
			),
			codecs,
		);
	};
};

/**
 * Creates one Fetch route handler per method and path of a route tree, to
 * register on a router.
 *
 * @remarks Use {@link createCatchAllHandler} to let rest-rpc do the routing
 * instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export function createRouteHandlers<TRoutes extends RuntimeImplementationTree>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions = {},
): FetchRoute<TreeInitialContext<TRoutes>>[] {
	const codecs = createBodyCodecRegistry([
		sseBodyCodec,
		...(options.bodyCodecs ?? []),
	]);
	const dispatch = createFetchDispatch(options, codecs);

	return flattenRouteImplementations(implementations).map((implementation) => {
		const path = resolveImplementationPath(implementation.route.path);
		const { method } = implementation.route;
		if (implementation.isStatic) {
			const createResponse = prepareStaticResponse(
				implementation,
				codecs,
				options.disableResponseValidation ?? false,
			);
			return {
				method,
				path,
				handle: async () => createResponse(),
				staticResponse: createResponse(),
			};
		}
		const pathParams = parsePathParams(path);
		return {
			method,
			path,
			handle: (request, ...[handleOptions]) =>
				dispatch(implementation, pathParams, request, handleOptions),
		};
	});
}

/**
 * Creates a Fetch catch-all handler that routes requests to the routes of a
 * route tree.
 *
 * @remarks An unmatched request is returned to the caller with `matched: false`
 * so the surrounding runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler<
	TRoutes extends RuntimeImplementationTree,
>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions = {},
): (
	request: Request,
	...options: OptionsArgs<
		TreeInitialContext<TRoutes>,
		CatchAllHandleOptions<TreeInitialContext<TRoutes>>
	>
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(
		createRouteHandlers<RuntimeImplementationTree>(implementations, options),
	);

	return async (request, ...[handleOptions]) => {
		const match = matchRoute(
			request.method,
			request.url,
			handleOptions?.mountPath,
		);
		if (!match) {
			return { matched: false, response: undefined };
		}

		// Unless the caller passes params, the matched ones are passed on, so they
		// are not parsed from the URL again and params another router attached to
		// the request are ignored.
		const { route, params } = match;
		return {
			matched: true,
			response: await route.handle(
				request,
				params && !handleOptions?.params
					? { ...handleOptions, params }
					: handleOptions,
			),
		};
	};
}
