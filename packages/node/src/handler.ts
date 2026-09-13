import type { IncomingMessage, ServerResponse } from "node:http";
import {
	createRouteMatcher,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type RuntimeImplementationTree,
} from "@rest-rpc/server";
import type { DefaultContext, NodeRouteHandlerResult } from "./index.ts";
import { createRequestSignal } from "./lifecycle.ts";
import {
	defaultBodyParser,
	parseRequestTarget,
	type NodeBodyParser,
} from "./request.ts";
import { writeNodeResponse } from "./response.ts";

/** Options for the general Node HTTP catch-all handler. */
export type CreateNodeHandlerOptions = {
	bodyParser?: NodeBodyParser;
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
};

/** Handles a request validation error using native Node HTTP arguments. */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: IncomingMessage,
	response: ServerResponse,
) => unknown;

/** Handles a response validation error using native Node HTTP arguments. */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: IncomingMessage,
	response: ServerResponse,
) => unknown;

type ContextArguments = {} extends DefaultContext
	? [context?: DefaultContext]
	: [context: DefaultContext];

/** Creates a Node HTTP catch-all handler that leaves unmatched requests untouched. */
export function createRouteHandler(
	implementations: RuntimeImplementationTree,
	options: CreateNodeHandlerOptions = {},
): (
	request: IncomingMessage,
	response: ServerResponse,
	...contextArguments: ContextArguments
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(implementations);
	const bodyParser = options.bodyParser ?? defaultBodyParser;

	return async (request, response, ...contextArguments) => {
		const url = parseRequestTarget(request);
		const matched = matchRoute({
			method: request.method ?? "GET",
			path: url.pathname,
		});
		if (!matched) {
			return { matched: false };
		}

		const signal = createRequestSignal(request, response);
		let body: unknown;
		try {
			body = await bodyParser(request);
		} catch (error) {
			if (options.bodyParser !== undefined) throw error;
			response.statusCode = 400;
			response.setHeader("content-type", "application/json");
			response.end(
				JSON.stringify({ message: "Failed to parse request body." }),
			);
			return { matched: true };
		}
		const parsedRequest = {
			params: matched.params,
			query: url.searchParams,
			headers: request.headers,
			body,
		};

		try {
			const implementation = matched.implementation;
			const result = await handleHttpRoute(
				implementation.route,
				implementation.handler as (request: unknown) => unknown,
				{
					request: parsedRequest,
					context: contextArguments[0] ?? {},
					handlerFields: { req: request, res: response, signal },
				},
			);
			if (!response.destroyed) await writeNodeResponse(result, response);
			return { matched: true };
		} catch (error) {
			if (error instanceof RequestValidationError) {
				if (options.requestValidationErrorHandler) {
					await options.requestValidationErrorHandler(error, request, response);
					return { matched: true };
				}

				response.statusCode = 400;
				response.setHeader("content-type", "application/json");
				response.end(
					JSON.stringify({
						message:
							"Request validation failed. Check the validationErrors field for details.",
						validationErrors: error.issues,
					}),
				);
				return { matched: true };
			}

			if (error instanceof ResponseValidationError) {
				if (options.responseValidationErrorHandler) {
					await options.responseValidationErrorHandler(
						error,
						request,
						response,
					);
					return { matched: true };
				}

				if (response.headersSent) throw error;
				response.statusCode = 500;
				response.setHeader("content-type", "application/json");
				response.end(
					JSON.stringify({ message: "Response validation failed." }),
				);
				return { matched: true };
			}

			throw error;
		}
	};
}
