import type { AbsolutePath, BodyCodec } from "@rest-rpc/core";
import type { HttpMethod } from "@rest-rpc/core/contract";
import {
	assertRequestBodyLimit,
	deserializeRequestBody,
} from "@rest-rpc/fetch/adapter";
import type { ServerResponse } from "node:http";
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
	type HandleHttpRouteConfiguration,
	type RuntimeImplementation,
	type RuntimeImplementationTree,
} from "@rest-rpc/server";
import type {
	DefaultContext,
	DefaultRequest,
	NodeRouteHandlerResult,
} from "./index.ts";
import { createRequestSignal } from "./lifecycle.ts";
import { toFetchRequest, parseRequestTarget } from "./request.ts";
import { writeNodeResponse } from "./response.ts";

/**
 * Customizes paths, request parsing and validation failures for compiled Node routes.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#options}
 */
export type CompileRoutesOptions = {
	bodyCodecs?: readonly BodyCodec<DefaultRequest>[];
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
 * Defines how an invalid request is written through native Node HTTP arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: DefaultRequest,
	response: ServerResponse,
) => unknown;

/**
 * Defines how invalid handler output is written through native Node HTTP arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: DefaultRequest,
	response: ServerResponse,
) => unknown;

/**
 * Per-request options for compiled Node routes and the catch-all handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#context}
 */
export type HandleOptions = {
	/** Initial context values, set before middleware runs. */
	context?: Partial<DefaultContext>;
};

/**
 * A compiled route ready to be registered on a router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#routes}
 */
export type NodeRoute = {
	readonly method: HttpMethod;
	/** Route path with prefix applied and param markers per `paramSyntax`. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route and writes the result,
	 * including streams, to `response`. Params are read from the request URL.
	 */
	readonly handle: (
		request: DefaultRequest,
		response: ServerResponse,
		options?: HandleOptions,
	) => Promise<void>;
};

type NodeDispatch = (
	implementation: RuntimeImplementation,
	params: Record<string, string>,
	request: DefaultRequest,
	response: ServerResponse,
	url: URL,
	options: HandleOptions | undefined,
) => Promise<void>;

type MatchedDispatch = (
	params: Record<string, string>,
	request: DefaultRequest,
	response: ServerResponse,
	url: URL,
	options: HandleOptions | undefined,
) => Promise<void>;

// Lets the catch-all dispatch with params it already matched.
const matchedDispatches = new WeakMap<NodeRoute, MatchedDispatch>();

const writeJson = (response: ServerResponse, status: number, body: unknown) => {
	response.statusCode = status;
	response.setHeader("content-type", "application/json");
	response.end(JSON.stringify(body));
};

const createNodeDispatch = (options: CompileRoutesOptions): NodeDispatch => {
	const bodyCodecs = options.bodyCodecs ?? [];
	const maxBytes = options.requestBodyLimit;
	assertRequestBodyLimit(maxBytes);

	return async (
		implementation,
		params,
		request,
		response,
		url,
		handleOptions,
	) => {
		const rejection = assertRequestContentType(
			implementation.route,
			request.headers["content-type"],
		);
		if (rejection) {
			writeJson(response, rejection.status, { message: rejection.message });
			return;
		}

		const signal = createRequestSignal(response);
		const { body, rejection: bodyRejection } = await deserializeRequestBody(
			request,
			{
				toFetchRequest: () => toFetchRequest(request, signal),
				contentType: request.headers["content-type"],
			},
			bodyCodecs,
			maxBytes,
		);
		if (bodyRejection) {
			writeJson(response, bodyRejection.status, {
				message: bodyRejection.message,
			});
			return;
		}
		const parsedRequest = {
			params,
			query: url.searchParams,
			headers: request.headers,
			body,
		};

		const result = await handleHttpRoute(implementation, {
			configuration: {
				disableRequestValidation: options.disableRequestValidation,
				disableResponseValidation: options.disableResponseValidation,
			},
			request: parsedRequest,
			handlerFields: { req: request, res: response, signal },
			context: handleOptions?.context,
		});

		if (result instanceof RequestValidationError) {
			if (options.requestValidationErrorHandler) {
				await options.requestValidationErrorHandler(result, request, response);
			} else {
				writeJson(response, result.status, result.responseBody);
			}
			return;
		}

		if (result instanceof ResponseValidationError) {
			if (options.responseValidationErrorHandler) {
				await options.responseValidationErrorHandler(result, request, response);
			} else {
				if (response.headersSent) throw result;
				writeJson(response, result.status, result.responseBody);
			}
			return;
		}

		// Stream validation runs while writing. The stream pipeline destroys the
		// response when a chunk fails, and the error rejects like any other write
		// failure.
		if (!response.destroyed)
			await writeNodeResponse(result, response, bodyCodecs);
	};
};

/**
 * Compiles a route tree into Node routes to register on a router.
 *
 * @remarks Pass the result to {@link createCatchAllHandler} to let rest-rpc
 * do the routing instead.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#routes}
 */
export function compileRoutes(
	implementations: RuntimeImplementationTree,
	options: CompileRoutesOptions = {},
): NodeRoute[] {
	const dispatch = createNodeDispatch(options);

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
			response,
			url,
			handleOptions,
		) =>
			dispatch(implementation, params, request, response, url, handleOptions);
		const route: NodeRoute = {
			method: implementation.route.method,
			path,
			handle: async (request, response, handleOptions) => {
				const url = parseRequestTarget(request);
				const params = readParams(url.pathname);
				if (!params) {
					throw new Error(
						`Request path "${url.pathname}" does not match route "${implementation.route.method} ${path}".`,
					);
				}
				return dispatchMatched(params, request, response, url, handleOptions);
			},
		};
		matchedDispatches.set(route, dispatchMatched);
		return route;
	});
}

/**
 * Creates a Node HTTP catch-all handler that routes requests to compiled routes.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export function createCatchAllHandler(
	routes: readonly NodeRoute[],
): (
	request: DefaultRequest,
	response: ServerResponse,
	options?: HandleOptions,
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(routes);

	return async (request, response, options) => {
		const url = parseRequestTarget(request);
		const matched = matchRoute(request.method ?? "GET", url.pathname);
		if (!matched) {
			return { matched: false };
		}

		const dispatchMatched = matchedDispatches.get(matched.route);
		if (dispatchMatched) {
			await dispatchMatched(matched.params, request, response, url, options);
		} else {
			await matched.route.handle(request, response, options);
		}
		return { matched: true };
	};
}
