import {
	createHttpDispatcher,
	type DispatchImplementationTree,
	type ImplementationContextArguments,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import { defaultParseBody, type FetchRouteParseBody } from "./request.ts";
import { createFetchResponse } from "./response.ts";

/** Options for the general Fetch catch-all handler. */
export type CreateFetchHandlerOptions = {
	parseBody?: FetchRouteParseBody;
	errorHandlers?: ServerErrorHandlers<Record<string, unknown>>;
};

type FetchRouteHandlerResult =
	| { matched: true; response: Response }
	| { matched: false; response: undefined };

/** Creates a Fetch catch-all handler from an ordinary route implementation tree. */
export function createRouteHandler<
	const TTree extends DispatchImplementationTree,
>(
	implementations: TTree,
	options: CreateFetchHandlerOptions = {},
): (
	request: Request,
	...contextArguments: ImplementationContextArguments<TTree>
) => Promise<FetchRouteHandlerResult> {
	const dispatch = createHttpDispatcher(implementations);
	const parseBody = options.parseBody ?? defaultParseBody;
	return async (request, ...contextArguments) => {
		const context = (contextArguments[0] ?? {}) as Record<string, unknown>;
		const url = new URL(request.url);
		const result = await dispatch({
			method: request.method,
			path: url.pathname,
			context,
			signal: request.signal,
			catchParsingErrors: options.parseBody === undefined,
			errorHandlers: options.errorHandlers,
			decode: async ({ implementation, params }) => ({
				params,
				query: Object.fromEntries(url.searchParams),
				headers: Object.fromEntries(request.headers),
				body: await parseBody({
					request,
					route: implementation.route,
					body: implementation.route.request?.body,
				}),
			}),
		});
		return result === undefined
			? { matched: false, response: undefined }
			: { matched: true, response: await createFetchResponse(result) };
	};
}
