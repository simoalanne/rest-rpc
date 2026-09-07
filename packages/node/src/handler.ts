import type { IncomingMessage, ServerResponse } from "node:http";
import {
	createRouteMatcher,
	handleHttpRoute,
	type RuntimeImplementationTree,
	type ServerErrorHandlers,
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
	errorHandlers?: ServerErrorHandlers<Record<string, unknown>>;
};

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
		if (!matched || matched.implementation.route.mode === "webSocket") {
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
			query: Object.fromEntries(url.searchParams),
			headers: request.headers,
			body,
		};

		const implementation = matched.implementation;
		const result = await handleHttpRoute(
			implementation.route,
			implementation.handler as (request: unknown) => unknown,
			{
				request: parsedRequest,
				context: { ...contextArguments[0], signal },
				errorHandlers: options.errorHandlers,
			},
		);
		if (!response.destroyed) await writeNodeResponse(result, response);
		return { matched: true };
	};
}
