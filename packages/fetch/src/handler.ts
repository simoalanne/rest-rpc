import {
	createRouteMatcher,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type RuntimeImplementationTree,
} from "@rest-rpc/server";
import type { DefaultContext } from "./index.ts";
import { defaultBodyParser, type FetchBodyParser } from "./request.ts";
import { createFetchResponse } from "./response.ts";

/** Options for the general Fetch catch-all handler. */
export type CreateFetchHandlerOptions = {
	bodyParser?: FetchBodyParser;
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
};

/** Handles a request validation error using native Fetch arguments. */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: Request,
) => Response | Promise<Response>;

/** Handles a response validation error using native Fetch arguments. */
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

/** Creates a Fetch catch-all handler from an ordinary route implementation tree. */
export function createRouteHandler(
	implementations: RuntimeImplementationTree,
	options: CreateFetchHandlerOptions = {},
): (
	request: Request,
	...contextArguments: ContextArguments
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(implementations);
	const bodyParser = options.bodyParser ?? defaultBodyParser;

	return async (request, ...contextArguments) => {
		const url = new URL(request.url);
		const matched = matchRoute({
			method: request.method,
			path: url.pathname,
		});
		if (!matched || matched.implementation.route.mode === "webSocket") {
			return { matched: false, response: undefined };
		}

		let body: unknown;
		try {
			body = await bodyParser(request);
		} catch (error) {
			if (options.bodyParser !== undefined) throw error;
			return {
				matched: true,
				response: Response.json(
					{ message: "Invalid request body" },
					{
						status: 400,
					},
				),
			};
		}
		const parsedRequest = {
			params: matched.params,
			query: url.searchParams,
			headers: Object.fromEntries(request.headers),
			body,
		};

		try {
			const implementation = matched.implementation;
			const result = await handleHttpRoute(
				implementation.route,
				implementation.handler as (request: unknown) => unknown,
				{
					request: parsedRequest,
					context: { ...contextArguments[0], signal: request.signal },
				},
			);

			return { matched: true, response: await createFetchResponse(result) };
		} catch (error) {
			if (error instanceof RequestValidationError) {
				const response = options.requestValidationErrorHandler
					? await options.requestValidationErrorHandler(error, request)
					: Response.json(
							{
								message:
									"Request validation failed. Check the validationErrors field for details.",
								validationErrors: error.issues,
							},
							{ status: 400 },
						);
				return { matched: true, response };
			}

			if (error instanceof ResponseValidationError) {
				const response = options.responseValidationErrorHandler
					? await options.responseValidationErrorHandler(error, request)
					: Response.json(
							{ message: "Response validation failed." },
							{ status: 500 },
						);
				return { matched: true, response };
			}

			throw error;
		}
	};
}
