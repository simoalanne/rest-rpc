import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import {
	constructBaseRequest,
	type ExecuteRequestOptions,
	executeRequest,
} from "./request.ts";
import {
	fetchResponse as fetchRouteResponse,
	fetchSuccess,
	type RouteRequestFn,
} from "./response.ts";
import { hasSingleSuccessfulResponse, isWebSocketRouteNode } from "./routes.ts";
import { isSseRouteNode, openSseConnection } from "./sse.ts";
import type {
	ApiClientFor,
	ApiClientOptions,
	FetchArgs,
	OpenConnectionArgs,
} from "./types.ts";
import { openConnection as openRouteConnection } from "./websocket.ts";

/**
 * Creates a typed fetch client from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client}
 */
export function initClient<
	TContract extends Contract,
	const TStrictStatusCodes extends boolean = false,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TStrictStatusCodes, TGlobalHeaders>,
): ApiClientFor<TContract, TStrictStatusCodes, TGlobalHeaders> {
	const strictStatusCodes = options.strictStatusCodes ?? false;
	const strictRequestKeys = options.strictRequestKeys ?? true;
	const validateResponses = options.validateResponses ?? false;
	const requestOptions: ExecuteRequestOptions = {
		baseUrl: options.baseUrl,
		fetch: options.fetch,
		fetchOptions: options.fetchOptions,
		getGlobalHeaders: options.getGlobalHeaders,
		nextFetchTags: options.nextFetchTags,
		timeoutMs: options.timeoutMs,
		strictRequestKeys,
	};

	const request: RouteRequestFn = (route, ...args) =>
		executeRequest(route, args, requestOptions);

	const fetchResponse = (route: RouteDeclaration, ...args: FetchArgs) =>
		fetchRouteResponse(
			request,
			validateResponses,
			strictStatusCodes,
			route,
			...args,
		);

	return mapContractRoutes(contract, (node) => {
		if (isWebSocketRouteNode(node) || isSseRouteNode(node)) {
			return {
				openConnection: (...args: OpenConnectionArgs) => {
					const requestArgs = args.at(0);
					const { url } = constructBaseRequest(
						options.baseUrl,
						node,
						requestArgs,
						strictRequestKeys,
					);
					const connectionOptions = {
						validateIncomingMessages: validateResponses,
					};

					if (node.mode === "sse") {
						return openSseConnection(node, connectionOptions, url);
					}

					return openRouteConnection(node, connectionOptions, url);
				},
			};
		}

		const routeFetchResponse = (...args: FetchArgs) =>
			fetchResponse(node, ...args);

		if (!hasSingleSuccessfulResponse(node)) {
			return {
				fetchResponse: routeFetchResponse,
			};
		}

		return {
			fetch: (...args: FetchArgs) => fetchSuccess(fetchResponse, node, ...args),
			fetchResponse: routeFetchResponse,
		};
	}) as ApiClientFor<TContract, TStrictStatusCodes, TGlobalHeaders>;
}
