import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import { resolveRoutePath } from "../contract/path.ts";
import type { BodyCodec } from "../codecs/index.ts";
import {
	type ApiClientFetchOptions,
	type ClientHeaders,
	type FetchArgs,
	type FetchLike,
	executeRequest,
} from "./request.ts";
import {
	fetchResponse as fetchRouteResponse,
	type RouteRequestFn,
	type ClientResponseForDeclaration,
} from "./response.ts";

export type FetchResponseFn<
	E extends RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = (
	...args: FetchArgs<E, TGlobalHeaders>
) => Promise<ClientResponseForDeclaration<E>>;

/**
 * Infers the callable client operation for one declared route.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-routes}
 */
export type ApiClientRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = E extends RouteDeclaration ? FetchResponseFn<E, TGlobalHeaders> : never;

/**
 * Infers the client tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#type-helpers}
 */
export type ApiClientFor<
	T extends Contract = Contract,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = T extends { readonly "~restrpc": infer TRoute extends RouteDeclaration }
	? ApiClientRouteValue<TRoute, TGlobalHeaders>
	: {
			[K in keyof T]: T[K] extends Contract
				? ApiClientFor<T[K], TGlobalHeaders>
				: never;
		};

/**
 * Options used to create a typed fetch client.
 *
 * @remarks Literal keys in `globalHeaders` make matching declared
 * headers optional at individual call sites. Per-call Fetch options override
 * defaults from `fetchOptions`.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#client-options}
 */
export type ApiClientOptions<
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = {
	baseUrl: string;
	bodyCodecs?: readonly BodyCodec<Response>[];
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	globalHeaders?: TGlobalHeaders;
	timeoutMs?: number;
	validateResponses?: boolean;
};

/**
 * Creates a typed fetch client whose shape mirrors a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client}
 */
export function initClient<
	TContract extends Contract,
	const TGlobalHeaders extends ClientHeaders = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TGlobalHeaders>,
): ApiClientFor<TContract, TGlobalHeaders> {
	const request: RouteRequestFn = (route, ...args) =>
		executeRequest(route, args, options);

	const fetchResponse = (
		route: RouteDeclaration & { path: string },
		...args: FetchArgs
	) =>
		fetchRouteResponse(
			request,
			options.validateResponses ?? false,
			options.bodyCodecs,
			route,
			...args,
		);

	return mapContractRoutes(contract, (node, routePath) => {
		const resolvedRoute = {
			...node,
			path: resolveRoutePath(node, routePath),
		};
		return (...args: FetchArgs) => fetchResponse(resolvedRoute, ...args);
	}) as ApiClientFor<TContract, TGlobalHeaders>;
}
