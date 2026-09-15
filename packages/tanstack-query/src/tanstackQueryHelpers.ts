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
	RouteDeclaration,
	SuccessfulDeclaredClientResponse,
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
import { fetchQueryData } from "./queryData.ts";
import { createTanstackHelpersForRoute } from "./createHelperFunctions.ts";

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type WithHeaders<TResponse> = TResponse extends unknown
	? Simplify<TResponse & { headers: Headers }>
	: never;

type QueryRoute = { readonly "~restrpc": RouteDeclaration };

type RouteFor<E extends QueryRoute> = E["~restrpc"];

type DeclaredRouteQueryData<E extends RouteDeclaration> = WithHeaders<
	SuccessfulDeclaredClientResponse<E>
>;
type DeclaredRouteQueryError<E extends RouteDeclaration> =
	| WithHeaders<ErrorDeclaredClientResponse<E>>
	| Error;
type DeclaredRouteResponseBody<E extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<E> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;

type RouteRequestValue<E extends QueryRoute> = ClientRequest<RouteFor<E>>;

/**
 * Infers the successful query data returned for a route.
 *
 * @remarks HTTP routes retain their response envelope and include only 2xx
 * statuses. Procedure routes produce their output value directly.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#queries}
 */
export type RouteQueryData<E extends QueryRoute> =
	RouteFor<E> extends {
		kind: "procedure";
	}
		? ClientResponse<RouteFor<E>>
		: DeclaredRouteQueryData<RouteFor<E>>;

/**
 * Infers the error value surfaced by generated TanStack Query options.
 *
 * @remarks HTTP routes include declared non-2xx response envelopes and `Error`.
 * Procedure routes surface `Error` because they do not declare typed failures.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#error-model}
 */
export type RouteQueryError<E extends QueryRoute> =
	RouteFor<E> extends {
		kind: "procedure";
	}
		? Error
		: DeclaredRouteQueryError<RouteFor<E>>;

/**
 * Infers mutation variables for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#mutations}
 */
export type RouteMutationVariables<E extends QueryRoute> =
	RouteRequestValue<E> extends never ? undefined : RouteRequestValue<E>;

/**
 * Infers infinite query data for a route.
 *
 * @remarks Each page contains a successful route result, while each page
 * parameter contains the complete request used to fetch that page.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#infinite-queries}
 */
export type RouteInfiniteQueryData<E extends QueryRoute> = InfiniteData<
	RouteQueryData<E>,
	RouteRequestValue<E>
>;

type RouteStreamChunk<E extends QueryRoute> = [
	DeclaredRouteResponseBody<RouteFor<E>>,
] extends [never]
	? never
	: DeclaredRouteResponseBody<RouteFor<E>> extends AsyncIterable<infer TChunk>
		? TChunk
		: never;

/**
 * Infers the accumulated data returned by generated stream query options.
 *
 * @remarks The default accumulator materializes NDJSON chunks into an array
 * and omits the HTTP response envelope.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#streamed-queries}
 */
export type RouteStreamedQueryData<E extends QueryRoute> = [
	RouteStreamChunk<E>,
] extends [never]
	? never
	: Array<RouteStreamChunk<E>>;

export type TanstackQueryFetchOptions = ApiClientFetchOptions;

type WithFetchOptions<T> = T & {
	fetchOptions?: TanstackQueryFetchOptions;
};

type QueryOptionsFor<
	E extends QueryRoute,
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
	E extends QueryRoute,
	TData = RouteQueryData<E>,
> = QueryObserverOptions<RouteQueryData<E>, RouteQueryError<E>, TData> & {
	queryKey: DataTag<QueryKey, RouteQueryData<E>, RouteQueryError<E>>;
};

type MutationOptionsFor<E extends QueryRoute> = WithFetchOptions<
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
	E extends QueryRoute,
	TData = RouteInfiniteQueryData<E>,
> = WithFetchOptions<
	Omit<
		InfiniteQueryObserverOptions<
			RouteQueryData<E>,
			RouteQueryError<E>,
			TData,
			QueryKey,
			RouteRequestValue<E>
		>,
		"queryFn" | "queryKey" | "initialPageParam" | "getNextPageParam"
	> & {
		queryKey?: QueryKey;
		initialRequest: RouteRequestValue<E>;
		getNextRequest: (
			lastPage: RouteQueryData<E>,
			allPages: Array<RouteQueryData<E>>,
			lastRequest: RouteRequestValue<E>,
			allRequests: Array<RouteRequestValue<E>>,
		) => RouteRequestValue<E> | undefined | null;
	}
>;

type InfiniteQueryOptionsResultFor<
	E extends QueryRoute,
	TData = RouteInfiniteQueryData<E>,
> = InfiniteQueryObserverOptions<
	RouteQueryData<E>,
	RouteQueryError<E>,
	TData,
	QueryKey,
	RouteRequestValue<E>
> & {
	queryKey: DataTag<QueryKey, RouteInfiniteQueryData<E>, RouteQueryError<E>>;
};

type StreamedQueryRefetchMode = "append" | "reset" | "replace";

type StreamedQueryBaseOptions = {
	refetchMode?: StreamedQueryRefetchMode;
};

type StreamedQuerySimpleOptions<
	E extends QueryRoute,
	TSelectedData,
> = StreamedQueryBaseOptions & {
	reducer?: never;
	initialValue?: never;
	streamFn?: never;
	queryKey?: QueryKey;
} & Omit<
		QueryObserverOptions<
			RouteStreamedQueryData<E>,
			RouteQueryError<E>,
			TSelectedData,
			RouteStreamedQueryData<E>
		>,
		"queryFn" | "queryKey"
	>;

type StreamedQueryReducedOptions<
	E extends QueryRoute,
	TData,
	TSelectedData,
> = StreamedQueryBaseOptions & {
	reducer: (acc: TData, chunk: RouteStreamChunk<E>) => TData;
	initialValue: TData;
	streamFn?: never;
	queryKey?: QueryKey;
} & Omit<
		QueryObserverOptions<TData, RouteQueryError<E>, TSelectedData, TData>,
		"queryFn" | "queryKey"
	>;

type streamedQueryOptionsFor<
	E extends QueryRoute,
	TData,
	TSelectedData,
> = WithFetchOptions<
	[TData] extends [RouteStreamedQueryData<E>]
		?
				| StreamedQuerySimpleOptions<E, TSelectedData>
				| StreamedQueryReducedOptions<E, TData, TSelectedData>
		: StreamedQueryReducedOptions<E, TData, TSelectedData>
>;

type streamedQueryOptionsResultFor<
	E extends QueryRoute,
	TData,
	TSelectedData,
> = QueryObserverOptions<TData, RouteQueryError<E>, TSelectedData, TData> & {
	queryKey: DataTag<QueryKey, TData, RouteQueryError<E>>;
};

type StreamedQueryArgs<E extends QueryRoute, TData, TSelectedData> = [
	RouteRequestValue<E>,
] extends [never]
	? [
			request?: undefined,
			options?: streamedQueryOptionsFor<E, TData, TSelectedData>,
		]
	: [
			request: RouteRequestValue<E> | SkipToken,
			options?: streamedQueryOptionsFor<E, TData, TSelectedData>,
		];

type UseQueryArgs<E extends QueryRoute, TData = RouteQueryData<E>> =
	RouteRequestValue<E> extends never
		? [request?: undefined, options?: QueryOptionsFor<E, TData>]
		: [
				request: RouteRequestValue<E> | SkipToken,
				options?: QueryOptionsFor<E, TData>,
			];

type GetKeyArgs<E extends QueryRoute> =
	RouteRequestValue<E> extends never ? [] : [request: RouteRequestValue<E>];

/**
 * Describes the typed `queryOptions()` method available for a route.
 *
 * @remarks Passing TanStack Query's `skipToken` instead of request input
 * produces disabled query options without losing route type safety.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#queries}
 */
export type RouteQueryOptionsMethod<E extends QueryRoute> = {
	<TData = RouteQueryData<E>>(
		...args: UseQueryArgs<E, TData>
	): QueryOptionsResultFor<E, TData>;
};

type TanstackQueryBaseRouteValue<E extends QueryRoute> = {
	mutationOptions: (
		options?: MutationOptionsFor<E>,
	) => MutationOptions<
		RouteQueryData<E>,
		RouteQueryError<E>,
		RouteMutationVariables<E>
	>;
	queryOptions: RouteQueryOptionsMethod<E>;
	infiniteQueryOptions: <TData = RouteInfiniteQueryData<E>>(
		options: InfiniteQueryOptionsFor<E, TData>,
	) => InfiniteQueryOptionsResultFor<E, TData>;
	getKey: (
		...args: GetKeyArgs<E>
	) => DataTag<QueryKey, RouteQueryData<E>, RouteQueryError<E>>;
};

type TanstackQueryStreamRouteValue<E extends QueryRoute> = [
	DeclaredRouteResponseBody<RouteFor<E>>,
] extends [never]
	? Record<never, never>
	: DeclaredRouteResponseBody<RouteFor<E>> extends AsyncIterable<unknown>
		? {
				streamedQueryOptions: <
					TData = RouteStreamedQueryData<E>,
					TSelectedData = TData,
				>(
					...args: StreamedQueryArgs<E, TData, TSelectedData>
				) => streamedQueryOptionsResultFor<E, TData, TSelectedData>;
			}
		: Record<never, never>;

type TanstackQueryRouteValue<E extends QueryRoute> =
	TanstackQueryBaseRouteValue<E> & TanstackQueryStreamRouteValue<E>;

type TanstackQueryTreeFor<T extends Contract> = {
	[
		K in keyof T as T[K] extends Contract
			? TanstackQueryHelpersFor<T[K]> extends never
				? never
				: keyof TanstackQueryHelpersFor<T[K]> extends never
					? never
					: K
			: never
	]: T[K] extends Contract ? TanstackQueryHelpersFor<T[K]> : never;
};

/**
 * Infers the generated TanStack Query helper tree for a contract.
 *
 * @remarks The helper tree mirrors the contract. Each route exposes query,
 * mutation, and key helpers; eligible streaming routes also expose streamed
 * query options.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query}
 */
export type TanstackQueryHelpersFor<T extends Contract> = T extends QueryRoute
	? TanstackQueryRouteValue<T>
	: TanstackQueryTreeFor<T>;

/**
 * Options used to create TanStack Query helpers from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#setup}
 */
export type CreateTanstackQueryHelpersOptions<
	TGlobalHeaders extends Record<string, string> = Record<never, string>,
> = ApiClientOptions<TGlobalHeaders>;

const getRouteDeclaration = (value: unknown): RouteDeclaration | undefined =>
	typeof value === "object" &&
	value !== null &&
	"~restrpc" in value &&
	typeof value["~restrpc"] === "object" &&
	value["~restrpc"] !== null
		? (value["~restrpc"] as RouteDeclaration)
		: undefined;

const getByPath = (tree: unknown, path: string[]) =>
	path.reduce((node, key) => (node as Record<string, unknown>)[key], tree);

/**
 * Creates a TanStack Query helper tree that mirrors a contract.
 *
 * @remarks Generated helpers create options and stable query keys; they do not
 * create a `QueryClient` or call framework-specific hooks.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#setup}
 */
export function createTanstackQueryHelpers<
	TContract extends Contract,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: CreateTanstackQueryHelpersOptions<TGlobalHeaders>,
): TanstackQueryHelpersFor<TContract> {
	const client = initClient(contract, options);

	const mapHttpRoutes = (node: Contract, path: string[] = []): unknown => {
		const route = getRouteDeclaration(node);
		if (route) {
			if (route.kind === "procedure") {
				const procedureClient = getByPath(client, path) as (
					...args: unknown[]
				) => Promise<unknown>;
				return createTanstackHelpersForRoute(
					path,
					procedureClient,
					procedureClient,
				);
			}
			const apiNode = getByPath(client, path) as FetchResponseFn<typeof route>;

			return createTanstackHelpersForRoute(
				path,
				(request, fetchOptions) =>
					fetchQueryData(
						apiNode as (...args: unknown[]) => Promise<unknown>,
						request,
						fetchOptions,
					),
				async (request, fetchOptions) => {
					const response = (await fetchQueryData(
						apiNode as (...args: unknown[]) => Promise<unknown>,
						request,
						fetchOptions,
					)) as { body: unknown };
					return response.body;
				},
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

	return mapHttpRoutes(contract) as TanstackQueryHelpersFor<TContract>;
}
