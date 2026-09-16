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
		const resolvedRoute: RouteDeclaration =
			node.kind === "procedure"
				? { ...node, path: `/${routePath.join("/")}` }
				: node;
		const flatInput =
			node.input === "input" ||
			(node.input === undefined && node.kind === "procedure");
		const plainOutput =
			node.output === "output" ||
			(node.output === undefined && node.kind === "procedure");
		return (...args: FetchArgs) => {
			if (
				node.input === "input" &&
				node.method === "GET" &&
				(typeof args[0] !== "object" ||
					args[0] === null ||
					Array.isArray(args[0]))
			) {
				return Promise.reject(
					new Error("GET flat input must be an object of query values."),
				);
			}
			const request = flatInput
				? { [node.method === "GET" ? "query" : "body"]: args[0] }
				: args[0];
			return plainOutput
				? fetchSuccess(
						fetchResponse,
						resolvedRoute,
						routePath,
						request as never,
						args[1],
					)
				: fetchResponse(resolvedRoute, routePath, request as never, args[1]);
		};
	}) as ApiClientFor<TContract, TGlobalHeaders>;
}
