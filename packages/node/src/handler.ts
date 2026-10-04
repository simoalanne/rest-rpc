import type { AbsolutePath, BodyCodec } from "@rest-rpc/core";
import {
	assertRequestBodyLimit,
	deserializeRequestBody,
} from "@rest-rpc/fetch/adapter";
import type { ServerResponse } from "node:http";
import {
	createRouteMatcher,
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type HandleHttpRouteConfiguration,
	type RuntimeImplementationTree,
} from "@rest-rpc/server";
import type { DefaultRequest, NodeRouteHandlerResult } from "./index.ts";
import { createRequestSignal } from "./lifecycle.ts";
import { toFetchRequest, parseRequestTarget } from "./request.ts";
import { writeNodeResponse } from "./response.ts";

/**
 * Customizes request parsing and validation failures for a Node HTTP handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#options}
 */
export type CreateNodeHandlerOptions = {
	bodyCodecs?: readonly BodyCodec<DefaultRequest>[];
	/** Path prefix to apply to all routes in the route tree during matching. */
	prefix?: AbsolutePath;
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
 * Creates a Node HTTP handler that dispatches matching rest-rpc routes.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export function createRouteHandler(
	implementations: RuntimeImplementationTree,
	options: CreateNodeHandlerOptions = {},
): (
	request: DefaultRequest,
	response: ServerResponse,
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(implementations, options.prefix);
	const bodyCodecs = options.bodyCodecs ?? [];
	const maxBytes = options.requestBodyLimit;
	assertRequestBodyLimit(maxBytes);

	return async (request, response) => {
		const url = parseRequestTarget(request);
		const matched = matchRoute({
			method: request.method ?? "GET",
			path: url.pathname,
		});
		if (!matched) {
			return { matched: false };
		}

		const rejection = assertRequestContentType(
			matched.implementation.route,
			request.headers["content-type"],
		);
		if (rejection) {
			response.statusCode = rejection.status;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ message: rejection.message }));
			return { matched: true };
		}

		const signal = createRequestSignal(request, response);
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
			response.statusCode = bodyRejection.status;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ message: bodyRejection.message }));
			return { matched: true };
		}
		const parsedRequest = {
			params: matched.params,
			query: url.searchParams,
			headers: request.headers,
			body,
		};

		const result = await handleHttpRoute(matched.implementation, {
			configuration: {
				disableRequestValidation: options.disableRequestValidation,
				disableResponseValidation: options.disableResponseValidation,
			},
			request: parsedRequest,
			handlerFields: { req: request, res: response, signal },
		});

		if (result instanceof RequestValidationError) {
			if (options.requestValidationErrorHandler) {
				await options.requestValidationErrorHandler(result, request, response);
			} else {
				response.statusCode = result.status;
				response.setHeader("content-type", "application/json");
				response.end(JSON.stringify(result.responseBody));
			}
			return { matched: true };
		}

		if (result instanceof ResponseValidationError) {
			if (options.responseValidationErrorHandler) {
				await options.responseValidationErrorHandler(result, request, response);
			} else {
				if (response.headersSent) throw result;
				response.statusCode = result.status;
				response.setHeader("content-type", "application/json");
				response.end(JSON.stringify(result.responseBody));
			}
			return { matched: true };
		}

		// Stream validation runs while writing. The stream pipeline destroys the
		// response when a chunk fails, and the error rejects like any other write
		// failure.
		if (!response.destroyed)
			await writeNodeResponse(result, response, bodyCodecs);
		return { matched: true };
	};
}
