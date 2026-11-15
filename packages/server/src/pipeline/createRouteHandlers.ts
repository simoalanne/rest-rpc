import { RouteError, type AbsolutePath, type BodyCodec } from "@rest-rpc/core";
import type { BodyCodecRegistry } from "@rest-rpc/core/codecs";
import type { HttpMethod } from "@rest-rpc/core/contract";
import type { EmptyObject, MaybePromise } from "@rest-rpc/core/utils";
import {
	createRouteMatcher,
	type RuntimeImplementationTree,
	type TreeInitialContext,
} from "../routing/match.ts";
import {
	bodyAlreadyRead,
	compileRouteTree,
	type DispatchResult,
	type RequestReader,
} from "./dispatch.ts";
import {
	serializeHttpRouteResult,
	serializeRouteError,
} from "./serializeHttpRouteResult.ts";

/**
 * Customizes request parsing, validation and error observation of route
 * handlers and catch-all handlers.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#route-options}
 */
export type CreateRouteHandlersOptions<TRequest = Request> = {
	bodyCodecs?: readonly BodyCodec[];
	/**
	 * Observes every error sent as an error response, and `RouteError`s that
	 * end a stream after its response started, such as stream item validation
	 * failures. It is not awaited, and errors it throws or rejects with are
	 * ignored, so it cannot change the response. It receives the Fetch
	 * `Request`, or the Node `IncomingMessage` with `@rest-rpc/server/node`.
	 */
	onError?: (error: RouteError, request: TRequest) => void;
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

// The body was read when it can no longer be, so codecs do not fail on it as
// if it were malformed.
const readFetchBody = (request: Request) => {
	if (request.bodyUsed) throw bodyAlreadyRead();
	return request;
};

const fetchRequestReader: RequestReader<Request> = {
	url: (request) => request.url,
	contentType: (request) => request.headers.get("content-type") ?? "",
	headers: (request) => Object.fromEntries(request.headers),
	body: readFetchBody,
};

const createFetchHeaders = () => new Headers();

const toFetchResponse = (
	result: DispatchResult,
	codecs: BodyCodecRegistry,
): MaybePromise<Response> =>
	result instanceof RouteError
		? serializeRouteError(result)
		: serializeHttpRouteResult(result, codecs);

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
	const { routes, dispatch, codecs } = compileRouteTree(
		implementations,
		options,
		fetchRequestReader,
		createFetchHeaders,
	);

	return routes.map(
		({ method, path, implementation, pathParams, staticResponse }) => {
			if (staticResponse) {
				// Codecs may return views of a `SharedArrayBuffer`, which `BodyInit` omits.
				const { status, headers, body } = staticResponse;
				const init = body as ConstructorParameters<typeof Response>[0];
				const createResponse = () => new Response(init, { status, headers });
				return {
					method,
					path,
					handle: async () => createResponse(),
					staticResponse: createResponse(),
				};
			}
			return {
				method,
				path,
				handle: async (request, ...[handleOptions]) =>
					toFetchResponse(
						await dispatch(
							implementation,
							pathParams,
							request,
							request.signal,
							handleOptions,
						),
						codecs,
					),
			};
		},
	);
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
