import type { IncomingMessage, ServerResponse } from "node:http";
import {
	createHttpDispatcher,
	createImplementationMatcher,
	type DispatchImplementationTree,
	type ImplementationContextArguments,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { NodeRouteHandlerResult } from "./index.ts";
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

/** Creates a Node HTTP catch-all handler that leaves unmatched requests untouched. */
export function createRouteHandler<
	const TTree extends DispatchImplementationTree,
>(
	implementations: TTree,
	options: CreateNodeHandlerOptions = {},
): (
	request: IncomingMessage,
	response: ServerResponse,
	...contextArguments: ImplementationContextArguments<TTree>
) => Promise<NodeRouteHandlerResult> {
	const dispatch = createHttpDispatcher(implementations);
	const match = createImplementationMatcher(implementations);
	const bodyParser = options.bodyParser ?? defaultBodyParser;
	return async (request, response, ...contextArguments) => {
		const context = (contextArguments[0] ?? {}) as Record<string, unknown>;
		const url = parseRequestTarget(request);
		const target = { method: request.method ?? "GET", path: url.pathname };
		const matched = match(target);
		if (!matched || matched.implementation.route.mode === "webSocket")
			return { matched: false };
		const signal = createRequestSignal(request, response);
		const result = await dispatch({
			...target,
			context,
			signal,
			catchParsingErrors: options.bodyParser === undefined,
			errorHandlers: options.errorHandlers,
			decode: async ({ params }) => ({
				params,
				query: Object.fromEntries(url.searchParams),
				headers: request.headers,
				body: await bodyParser(request),
			}),
		});
		if (result && !response.destroyed)
			await writeNodeResponse(result, response);
		return { matched: true };
	};
}
