import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import { type ExecuteRequestOptions, executeRequest } from "./request.ts";
import {
	fetchResponse as fetchRouteResponse,
	fetchSuccess,
	type RouteRequestFn,
} from "./response.ts";
import {
	createServerFirstClient,
	type ServerFirstClientFor,
	type ServerFirstClientOptions,
} from "./serverFirstClient.ts";
import type { ApiClientFor, ApiClientOptions, FetchArgs } from "./types.ts";

const createContractClient = <
	TContract extends Contract,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TGlobalHeaders>,
): ApiClientFor<TContract, TGlobalHeaders> => {
	const validateResponses = options.validateResponses ?? false;
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
		fetchRouteResponse(request, validateResponses, route, routePath, ...args);

	return mapContractRoutes(contract, (node, routePath) => {
		if (node.kind === "procedure") {
			const resolvedRoute: RouteDeclaration = {
				...node,
				path: `/${routePath.join("/")}`,
			};
			return (...args: FetchArgs) => {
				if (!resolvedRoute.request?.body) {
					return fetchSuccess(fetchResponse, resolvedRoute, routePath, ...args);
				}

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
};

/**
 * Creates a typed fetch client from a contract or server implementation tree.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client}
 */
export function initClient<
	const TTree,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	options: ServerFirstClientOptions<TGlobalHeaders>,
): ServerFirstClientFor<TTree, TGlobalHeaders>;

/** Creates a typed fetch client from a contract. */
export function initClient<
	TContract extends Contract,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TGlobalHeaders>,
): ApiClientFor<TContract, TGlobalHeaders>;

export function initClient(
	contractOrOptions: Contract | ServerFirstClientOptions,
	maybeOptions?: ApiClientOptions,
): unknown {
	if (maybeOptions === undefined) {
		return createServerFirstClient(
			contractOrOptions as ServerFirstClientOptions,
		);
	}

	return createContractClient(contractOrOptions as Contract, maybeOptions);
}
