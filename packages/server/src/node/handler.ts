import type { AbsolutePath, BodyCodec } from "@rest-rpc/core";
import type { HttpMethod } from "@rest-rpc/core/contract";
import {
	assertRequestBodyLimit,
	deserializeRequestBody,
} from "../pipeline/deserializeRequestBody.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	assertPathParams,
	createRouteMatcher,
	flattenRouteImplementations,
	readPathParams,
	resolveImplementationPath,
	type RuntimeImplementation,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import { assertRequestContentType } from "../pipeline/requestContentType.ts";
import {
	handleHttpRoute,
	type HandleOptions,
} from "../pipeline/handleHttpRoute.ts";
import {
	RequestValidationError,
	ResponseValidationError,
} from "../pipeline/errors.ts";
import { createRequestSignal } from "./lifecycle.ts";
import { splitRequestUrl } from "../routing/requestUrl.ts";
import { nodeBodyCodecs, type NodeRequestBody } from "./codecs.ts";
import { nodeRequestBody } from "./request.ts";
import { writeNodeResponse } from "./response.ts";

/**
 * Customizes paths, request parsing and validation failures for compiled Node routes.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#options}
 */
export type CompileRoutesOptions = {
	bodyCodecs?: readonly BodyCodec<NodeRequestBody>[];
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
	 * the request segments. See {@link https://rest-rpc.dev/docs/http-behavior/schemas#disabling-server-validation}.
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
	 * the response body. See {@link https://rest-rpc.dev/docs/http-behavior/schemas#disabling-server-validation}.
	 *
	 * @default false
	 */
	disableResponseValidation?: boolean;
};

/**
 * Defines how an invalid request is written through native Node HTTP arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: IncomingMessage,
	response: ServerResponse,
) => void | Promise<void>;

/**
 * Defines how invalid handler output is written through native Node HTTP arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: IncomingMessage,
	response: ServerResponse,
) => void | Promise<void>;

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
	 * including streams, to `response`. Params are read from the request URL
	 * unless passed in `options`.
	 */
	readonly handle: (
		request: IncomingMessage,
		response: ServerResponse,
		options?: HandleOptions,
	) => Promise<void>;
};

/**
 * Indicates whether the Node HTTP catch-all handler dispatched a request to a rest-rpc route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export type NodeRouteHandlerResult = { matched: boolean };

type NodeDispatch = (
	implementation: RuntimeImplementation,
	params: Record<string, string> | undefined,
	request: IncomingMessage,
	response: ServerResponse,
	search: string,
	options: HandleOptions | undefined,
) => Promise<void>;

const writeJson = (response: ServerResponse, status: number, body: unknown) => {
	response.statusCode = status;
	response.setHeader("content-type", "application/json");
	response.end(JSON.stringify(body));
};

const createNodeDispatch = (options: CompileRoutesOptions): NodeDispatch => {
	const bodyCodecs = options.bodyCodecs ?? [];
	const requestBodyCodecs = [...bodyCodecs, ...nodeBodyCodecs];
	const maxBytes = options.requestBodyLimit;
	assertRequestBodyLimit(maxBytes);

	return async (
		implementation,
		params,
		request,
		response,
		search,
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
			nodeRequestBody(request),
			requestBodyCodecs,
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
			query: search,
			headers: request.headers,
			body,
		};

		const result = await handleHttpRoute(implementation, {
			configuration: {
				disableRequestValidation: options.disableRequestValidation,
				disableResponseValidation: options.disableResponseValidation,
			},
			request: parsedRequest,
			signal,
			context: handleOptions?.context,
		});

		if (result instanceof RequestValidationError) {
			return options.requestValidationErrorHandler
				? options.requestValidationErrorHandler(result, request, response)
				: writeJson(response, result.status, result.responseBody);
		}

		if (result instanceof ResponseValidationError) {
			return options.responseValidationErrorHandler
				? options.responseValidationErrorHandler(result, request, response)
				: writeJson(response, result.status, result.responseBody);
		}

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
		return {
			method: implementation.route.method,
			path,
			handle: async (request, response, handleOptions) => {
				const { pathname, search } = splitRequestUrl(request.url ?? "/");
				let params: Record<string, string> | undefined;
				if (implementation.route.request?.params) {
					params = handleOptions?.params
						? assertPathParams(path, handleOptions.params)
						: readPathParams(path, pathname);
				}
				return dispatch(
					implementation,
					params,
					request,
					response,
					search,
					handleOptions,
				);
			},
		};
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
	request: IncomingMessage,
	response: ServerResponse,
	options?: HandleOptions,
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(routes);

	return async (request, response, options) => {
		const route = matchRoute(
			request.method ?? "GET",
			splitRequestUrl(request.url ?? "/").pathname,
		);
		if (!route) {
			return { matched: false };
		}

		await route.handle(request, response, options);
		return { matched: true };
	};
}
