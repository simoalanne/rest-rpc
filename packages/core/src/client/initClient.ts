import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import { type ExecuteRequestOptions, executeRequest } from "./request.ts";
import {
	fetchResponse as fetchRouteResponse,
	fetchSuccess,
	type RouteRequestFn,
} from "./response.ts";
import type { ApiClientFor, ApiClientOptions, FetchArgs } from "./types.ts";

/**
 * Creates a typed fetch client whose shape mirrors a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client}
 */
export function initClient<
	TContract extends Contract,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TGlobalHeaders>,
): ApiClientFor<TContract, TGlobalHeaders> {
	const requestOptions: ExecuteRequestOptions = {
		baseUrl: options.baseUrl,
		fetch: options.fetch,
		fetchOptions: options.fetchOptions,
		getGlobalHeaders: options.getGlobalHeaders,
		nextFetchTags: options.nextFetchTags,
		timeoutMs: options.timeoutMs,
	};

	const request: RouteRequestFn = (route, routePath, ...args) =>
		executeRequest(route, routePath, args, requestOptions);

	const fetchResponse = (
		route: RouteDeclaration,
		routePath: readonly string[],
		...args: FetchArgs
	) =>
		fetchRouteResponse(
			request,
			route.source !== "generated" && (options.validateResponses ?? false),
			options.bodyParser,
			route,
			routePath,
			...args,
		);

	return mapContractRoutes(contract, (node, routePath) => {
		if (node.kind === "procedure") {
			const resolvedRoute: RouteDeclaration = {
				...node,
				path: `/${routePath.join("/")}`,
			};
			return (...args: FetchArgs) => {
				return fetchSuccess(
					fetchResponse,
					resolvedRoute,
					routePath,
					{ body: args[0] } as never,
					args[1],
				);
			};
		}

		return (...args: FetchArgs) => fetchResponse(node, routePath, ...args);
	}) as ApiClientFor<TContract, TGlobalHeaders>;
}
