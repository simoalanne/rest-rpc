import {
	createRouteMatcher,
	handleHttpRoute,
	type RuntimeImplementationTree,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { DefaultContext } from "./index.ts";
import { defaultBodyParser, type FetchBodyParser } from "./request.ts";
import { createFetchResponse } from "./response.ts";

/** Options for the general Fetch catch-all handler. */
export type CreateFetchHandlerOptions = {
	bodyParser?: FetchBodyParser;
	errorHandlers?: ServerErrorHandlers<Record<string, unknown>>;
};

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
			query: Object.fromEntries(url.searchParams),
			headers: Object.fromEntries(request.headers),
			body,
		};

		const implementation = matched.implementation;
		const result = await handleHttpRoute(
			implementation.route,
			implementation.handler as (request: unknown) => unknown,
			{
				request: parsedRequest,
				context: { ...contextArguments[0], signal: request.signal },
				errorHandlers: options.errorHandlers,
			},
		);

		return { matched: true, response: await createFetchResponse(result) };
	};
}
