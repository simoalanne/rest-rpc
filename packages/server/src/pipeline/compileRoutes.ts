import { RouteError, type BodyCodec } from "@rest-rpc/core";
import {
	createBodyCodecRegistry,
	normalizeMediaType,
} from "@rest-rpc/core/codecs";
import type { HttpMethod } from "@rest-rpc/core/contract";
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
} from "../routing/match.ts";
import { resolveRequestMediaType } from "./requestContentType.ts";
import {
	handleHttpRoute,
	type CatchAllHandleOptions,
	type HandleOptions,
	type HttpRouteResult,
} from "./handleHttpRoute.ts";
import { deserializeRequestBody } from "./deserializeRequestBody.ts";
import { resolveRouteError } from "./resolveRouteError.ts";
import {
	serializeHttpRouteResult,
	serializeRouteError,
} from "./serializeHttpRouteResult.ts";
import { parseQuery } from "./validation.ts";
import {
	readRequestPathname,
	readRequestSearch,
	stripMountPath,
} from "../routing/requestUrl.ts";
import { sseBodyCodec } from "./sse.ts";

/**
 * Customizes paths, request parsing, validation and error observation for compiled Fetch routes.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#compile-options}
 */
export type CompileRoutesOptions = {
	bodyCodecs?: readonly BodyCodec[];
	/**
	 * Rewrites param markers in compiled paths to `:name` (`"colon"`) or
	 * `{name}` (`"braces"`). Declared markers are kept when omitted.
	 */
	paramSyntax?: "colon" | "braces";
	/**
	 * Observes every error sent as an error response, and errors that end a
	 * stream after its response started. It is not awaited and cannot change
	 * the response.
	 */
	onError?: (error: RouteError, request: Request) => void;
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
export type FetchRoute = {
	readonly method: HttpMethod;
	/** Route path with param markers per `paramSyntax`. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route. Params and the body are
	 * read from the request unless passed in `options`.
	 */
	readonly handle: (
		request: Request,
		options?: HandleOptions,
	) => Promise<Response>;
};

type FetchDispatch = (
	implementation: RuntimeImplementation,
	pathParams: PathParams,
	request: Request,
	options: HandleOptions | undefined,
) => Promise<Response>;

const createFetchDispatch = (options: CompileRoutesOptions): FetchDispatch => {
	const codecs = createBodyCodecRegistry([
		sseBodyCodec,
		...(options.bodyCodecs ?? []),
	]);
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
		onError?.(resolved, request);
		return serializeRouteError(resolved);
	};

	return async (implementation, pathParams, request, handleOptions) => {
		const schemas = implementation.route.request;
		// The URL is only read for the params of dynamic path segments and a
		// declared query, and params a router attached to the request are used
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
				const deserializing = deserializeRequestBody(
					request,
					receivedMediaType,
					codecs,
				);
				const deserialized =
					deserializing instanceof Promise
						? await deserializing
						: deserializing;
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

		let result: HttpRouteResult;
		try {
			const handled = handleHttpRoute(implementation, {
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
				onStreamError: onError && ((error) => onError(error, request)),
			});
			result = handled instanceof Promise ? await handled : handled;
		} catch (error) {
			if (error instanceof RouteError) {
				return respondWithError(implementation, error, request);
			}
			throw error;
		}

		return serializeHttpRouteResult(result, codecs);
	};
};

/**
 * Compiles a route tree into Fetch routes to register on a router.
 *
 * @remarks Pass the result to {@link createCatchAllHandler} to let rest-rpc
 * do the routing instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export function compileRoutes(
	implementations: RuntimeImplementationTree,
	options: CompileRoutesOptions = {},
): FetchRoute[] {
	const dispatch = createFetchDispatch(options);

	return flattenRouteImplementations(implementations).map((implementation) => {
		const path = resolveImplementationPath(
			implementation.route.path,
			options.paramSyntax,
		);
		const pathParams = parsePathParams(path);
		return {
			method: implementation.route.method,
			path,
			handle: (request, handleOptions) =>
				dispatch(implementation, pathParams, request, handleOptions),
		};
	});
}

/**
 * Creates a Fetch catch-all handler that routes requests to compiled routes.
 *
 * @remarks An unmatched request is returned to the caller with `matched: false`
 * so the surrounding runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler(
	routes: readonly FetchRoute[],
): (
	request: Request,
	options?: CatchAllHandleOptions,
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(routes);

	return async (request, options) => {
		const pathname = readRequestPathname(request.url);
		const routePath = options?.mountPath
			? stripMountPath(pathname, options.mountPath)
			: pathname;
		const match = routePath && matchRoute(request.method, routePath);
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
				params && !options?.params ? { ...options, params } : options,
			),
		};
	};
}
