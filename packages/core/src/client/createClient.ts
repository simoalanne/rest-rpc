import type { Contract } from "../contract/contract.ts";
import type { RouteDeclaration } from "../contract/routeDeclaration.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import { resolveRoutePath } from "../contract/path.ts";
import { createBodyCodecRegistry, type BodyCodec } from "../codecs/index.ts";
import {
	type ApiClientFetchOptions,
	type ClientHeaders,
	type FetchArgs,
	type FetchLike,
	executeRequest,
} from "./request.ts";
import { readResponse } from "./response.ts";
import type {
	ClientRouteError,
	DeclaredClientResponse,
} from "../contract/response.ts";
import type { ClientPromise } from "./safe.ts";

/**
 * Infers the callable client operation for one declared route.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#call-routes}
 */
export type ApiClientRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = E extends RouteDeclaration
	? (
			...args: FetchArgs<E, TGlobalHeaders>
		) => ClientPromise<DeclaredClientResponse<E>, ClientRouteError<E> | Error>
	: never;

/**
 * Infers the client tree for a contract.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
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
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#client-options}
 */
export type ApiClientOptions<
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = {
	baseUrl: string;
	bodyCodecs?: readonly BodyCodec[];
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	globalHeaders?: TGlobalHeaders;
	timeoutMs?: number;
	validateResponses?: boolean;
};

/**
 * Creates a typed fetch client whose shape mirrors a contract.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client}
 */
export function createClient<
	TContract extends Contract,
	const TGlobalHeaders extends ClientHeaders = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TGlobalHeaders>,
): ApiClientFor<TContract, TGlobalHeaders> {
	const codecs = createBodyCodecRegistry(options.bodyCodecs ?? []);
	const requestOptions = { ...options, codecs };
	const validate = options.validateResponses ?? false;

	return mapContractRoutes(contract, (node, routePath) => {
		const resolvedRoute = {
			...node,
			path: resolveRoutePath(node, routePath),
		};
		return async (...args: FetchArgs) =>
			readResponse(
				await executeRequest(resolvedRoute, args, requestOptions),
				resolvedRoute,
				validate,
				codecs,
			);
	}) as ApiClientFor<TContract, TGlobalHeaders>;
}
