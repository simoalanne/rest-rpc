import type { BodyCodec } from "@rest-rpc/core";
import {
	createRouteMatcher,
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type RuntimeImplementationTree,
} from "@rest-rpc/server";
import type { DefaultContext } from "./index.ts";
import { deserializeRequestBody } from "./deserializeRequestBody.ts";
import { createFetchResponse } from "./response.ts";

/**
 * Customizes request parsing and validation failures for a Fetch catch-all handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#options}
 */
export type CreateFetchHandlerOptions = {
	bodyCodecs?: readonly BodyCodec<Request>[];
	/** The maximum accepted size of the request body in bytes. */
	requestBodyLimit?: number;
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
};

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

type FetchRouteHandlerResult =
	| { matched: true; response: Response }
	| { matched: false; response: undefined };

type ContextArguments = {} extends DefaultContext
	? [context?: DefaultContext]
	: [context: DefaultContext];

/**
 * Creates a Fetch catch-all handler that dispatches matching rest-rpc routes.
 *
 * @remarks An unmatched request is returned to the caller with `matched: false`
 * so the surrounding runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export function createRouteHandler(
	implementations: RuntimeImplementationTree,
	options: CreateFetchHandlerOptions = {},
): (
	request: Request,
	...contextArguments: ContextArguments
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(implementations);
	const bodyCodecs = options.bodyCodecs ?? [];
	const maxBytes = options.requestBodyLimit;
	if (
		maxBytes !== undefined &&
		(!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
	) {
		throw new Error("requestBodyLimit must be a positive safe integer");
	}

	return async (request, ...contextArguments) => {
		const url = new URL(request.url);
		const matched = matchRoute({
			method: request.method,
			path: url.pathname,
		});
		if (!matched) {
			return { matched: false, response: undefined };
		}

		const rejection = assertRequestContentType(
			matched.implementation.route,
			request.headers.get("content-type"),
		);
		if (rejection) {
			return {
				matched: true,
				response: Response.json(
					{ message: rejection.message },
					{ status: rejection.status },
				),
			};
		}

		const { body, rejection: bodyRejection } = await deserializeRequestBody(
			request,
			request,
			bodyCodecs,
			maxBytes,
		);
		if (bodyRejection) {
			return {
				matched: true,
				response: Response.json(
					{ message: bodyRejection.message },
					{ status: bodyRejection.status },
				),
			};
		}
		const parsedRequest = {
			params: matched.params,
			query: url.searchParams,
			headers: Object.fromEntries(request.headers),
			body,
		};

		const implementation = matched.implementation;
		const result = await handleHttpRoute(implementation, {
			request: parsedRequest,
			context: contextArguments[0] ?? {},
			handlerFields: { request, signal: request.signal },
		});
		if (result instanceof RequestValidationError) {
			if (options.requestValidationErrorHandler) {
				return {
					matched: true,
					response: await options.requestValidationErrorHandler(
						result,
						request,
					),
				};
			}

			return {
				matched: true,
				response: Response.json(result.responseBody, {
					status: result.status,
				}),
			};
		}

		if (result instanceof ResponseValidationError) {
			if (options.responseValidationErrorHandler) {
				return {
					matched: true,
					response: await options.responseValidationErrorHandler(
						result,
						request,
					),
				};
			}

			return {
				matched: true,
				response: Response.json(result.responseBody, {
					status: result.status,
				}),
			};
		}

		return {
			matched: true,
			response: await createFetchResponse(result, bodyCodecs),
		};
	};
}
