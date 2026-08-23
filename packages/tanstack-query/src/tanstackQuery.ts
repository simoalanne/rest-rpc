import { initClient } from "@rest-rpc/core";
import type {
	ApiClientFetchOptions,
	ApiClientOptions,
	ClientResponse,
	FetchResponseFn,
} from "@rest-rpc/core/client";
import type {
	ClientRequest,
	Contract,
	ErrorDeclaredClientResponse,
	HttpRouteDeclaration,
	RouteDeclaration,
	SuccessfulDeclaredClientResponse,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import type {
	DataTag,
	InfiniteData,
	InfiniteQueryObserverOptions,
	MutationOptions,
	QueryKey,
	QueryObserverOptions,
	SkipToken,
} from "@tanstack/query-core";
import { createRouteApi } from "./routeApi.ts";

type ClientUndeclaredResponse<E extends RouteDeclaration> = Extract<
	ClientResponse<E>,
	{ declared: false }
>;

/**
 * Infers the successful query data returned for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type RouteQueryData<E extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<E> & {
		headers: Headers;
	};

/**
 * Infers the error value surfaced by generated TanStack Query options.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type RouteQueryError<E extends RouteDeclaration> =
	| (ErrorDeclaredClientResponse<E> & { headers: Headers })
	| ClientUndeclaredResponse<E>
	| Error;

/**
 * Infers mutation variables for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type RouteMutationVariables<E extends RouteDeclaration> =
	ClientRequest<E> extends never ? undefined : ClientRequest<E>;

/**
 * Infers infinite query data for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type RouteInfiniteQueryData<E extends RouteDeclaration> = InfiniteData<
	RouteQueryData<E>,
	ClientRequest<E>
>;

export type TanstackQueryFetchOptions = ApiClientFetchOptions;

type WithFetchOptions<T> = T & {
	fetchOptions?: TanstackQueryFetchOptions;
};

type QueryOptionsFor<
	E extends RouteDeclaration,
	TData = RouteQueryData<E>,
> = WithFetchOptions<
	Omit<
		QueryObserverOptions<RouteQueryData<E>, RouteQueryError<E>, TData>,
		"queryKey" | "queryFn"
	> & {
		queryKey?: QueryKey;
	}
>;

type QueryOptionsResultFor<
	E extends RouteDeclaration,
	TData = RouteQueryData<E>,
> = QueryObserverOptions<RouteQueryData<E>, RouteQueryError<E>, TData> & {
	queryKey: DataTag<QueryKey, RouteQueryData<E>, RouteQueryError<E>>;
};

type MutationOptionsFor<E extends RouteDeclaration> = WithFetchOptions<
	Omit<
		MutationOptions<
			RouteQueryData<E>,
			RouteQueryError<E>,
			RouteMutationVariables<E>
		>,
		"mutationFn"
	>
>;

type InfiniteQueryOptionsFor<
	E extends RouteDeclaration,
	TData = RouteInfiniteQueryData<E>,
> = WithFetchOptions<
	Omit<
		InfiniteQueryObserverOptions<
			RouteQueryData<E>,
			RouteQueryError<E>,
			TData,
			QueryKey,
			ClientRequest<E>
		>,
		"queryFn" | "queryKey" | "initialPageParam" | "getNextPageParam"
	> & {
		queryKey?: QueryKey;
		initialRequest: ClientRequest<E>;
		getNextRequest: (
			lastPage: RouteQueryData<E>,
			allPages: Array<RouteQueryData<E>>,
			lastRequest: ClientRequest<E>,
			allRequests: Array<ClientRequest<E>>,
		) => ClientRequest<E> | undefined | null;
	}
>;

type InfiniteQueryOptionsResultFor<
	E extends RouteDeclaration,
	TData = RouteInfiniteQueryData<E>,
> = InfiniteQueryObserverOptions<
	RouteQueryData<E>,
	RouteQueryError<E>,
	TData,
	QueryKey,
	ClientRequest<E>
> & {
	queryKey: DataTag<QueryKey, RouteInfiniteQueryData<E>, RouteQueryError<E>>;
};

type QueryDisabled = false | null | undefined | "" | 0;

type UseQueryArgs<E extends RouteDeclaration, TData = RouteQueryData<E>> =
	ClientRequest<E> extends never
		? [options?: QueryOptionsFor<E, TData>]
		: [
				request: ClientRequest<E> | QueryDisabled | SkipToken,
				options?: QueryOptionsFor<E, TData>,
			];

type GetKeyArgs<E extends RouteDeclaration> =
	ClientRequest<E> extends never ? [] : [request: ClientRequest<E>];

type TanstackQueryRouteValue<E extends RouteDeclaration> = {
	mutationOptions: (
		options?: MutationOptionsFor<E>,
	) => MutationOptions<
		RouteQueryData<E>,
		RouteQueryError<E>,
		RouteMutationVariables<E>
	>;
	queryOptions: <TData = RouteQueryData<E>>(
		...args: UseQueryArgs<E, TData>
	) => QueryOptionsResultFor<E, TData>;
	infiniteQueryOptions: <TData = RouteInfiniteQueryData<E>>(
		options: InfiniteQueryOptionsFor<E, TData>,
	) => InfiniteQueryOptionsResultFor<E, TData>;
	getKey: (
		...args: GetKeyArgs<E>
	) => DataTag<QueryKey, RouteQueryData<E>, RouteQueryError<E>>;
};

type TanstackQueryTreeFor<T extends Contract> = {
	[K in keyof T as T[K] extends Contract
		? TanstackQueryApiFor<T[K]> extends never
			? never
			: keyof TanstackQueryApiFor<T[K]> extends never
				? never
				: K
		: never]: T[K] extends Contract ? TanstackQueryApiFor<T[K]> : never;
};

export type TanstackQueryApiFor<T extends Contract> =
	T extends WebSocketRouteDeclaration
		? never
		: T extends HttpRouteDeclaration
			? TanstackQueryRouteValue<T>
			: TanstackQueryTreeFor<T>;

export type TanstackQueryOptions = ApiClientOptions;

/**
 * Infers the generated TanStack Query helper tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query}
 */
export type TanstackQuery<TContract extends Contract> =
	TanstackQueryApiFor<TContract>;

const isWebSocketRoute = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.mode === "webSocket";

const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

const getByPath = (tree: unknown, path: string[]) =>
	path.reduce((node, key) => (node as Record<string, unknown>)[key], tree);

/**
 * Creates TanStack Query option helpers from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#setup}
 */
export function initTanstackQuery<TContract extends Contract>(
	contract: TContract,
	options: TanstackQueryOptions,
): TanstackQuery<TContract> {
	const client = initClient(contract, options);

	const mapHttpRoutes = (node: Contract, path: string[] = []): unknown => {
		if (isRouteDeclaration(node)) {
			if (isWebSocketRoute(node)) return undefined;

			const apiNode = getByPath(client, path) as {
				fetchResponse: FetchResponseFn<typeof node>;
			};

			return createRouteApi(
				node,
				apiNode.fetchResponse as (...args: unknown[]) => Promise<unknown>,
			);
		}

		const entries = Object.entries(node)
			.map(([key, value]) => [key, mapHttpRoutes(value, [...path, key])])
			.filter((entry): entry is [string, unknown] => entry[1] !== undefined);

		if (entries.length === 0 && path.length > 0) {
			return undefined;
		}

		return Object.fromEntries(entries);
	};

	return mapHttpRoutes(contract) as TanstackQueryApiFor<TContract>;
}

export default initTanstackQuery;
