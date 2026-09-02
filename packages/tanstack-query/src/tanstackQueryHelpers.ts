import { initClient, type ClientResponseBody } from "@rest-rpc/core";
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

type ClientUndeclaredResponse<E extends RouteDeclaration> =
	Extract<ClientResponse<E>, { declared: false }> extends infer TResponse
		? Simplify<TResponse>
		: never;

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type WithHeaders<TResponse> = TResponse extends unknown
	? Simplify<TResponse & { headers: Headers }>
	: never;

/**
 * Infers the successful query data returned for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type RouteQueryData<E extends RouteDeclaration> = WithHeaders<
	SuccessfulDeclaredClientResponse<E>
>;

/**
 * Infers the error value surfaced by generated TanStack Query options.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type RouteQueryError<E extends RouteDeclaration> =
	| WithHeaders<ErrorDeclaredClientResponse<E>>
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

type RouteStreamChunk<E extends RouteDeclaration> = [
	ClientResponseBody<E>,
] extends [never]
	? never
	: ClientResponseBody<E> extends AsyncIterable<infer TChunk>
		? TChunk
		: never;

/**
 * Infers the accumulated data returned by generated stream query options.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type RouteStreamedQueryData<E extends RouteDeclaration> = [
	RouteStreamChunk<E>,
] extends [never]
	? never
	: Array<RouteStreamChunk<E>>;

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

type StreamedQueryRefetchMode = "append" | "reset" | "replace";

type StreamedQueryBaseOptions = {
	refetchMode?: StreamedQueryRefetchMode;
};

type StreamedQuerySimpleOptions<
	E extends RouteDeclaration,
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
	E extends RouteDeclaration,
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
	E extends RouteDeclaration,
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
	E extends RouteDeclaration,
	TData,
	TSelectedData,
> = QueryObserverOptions<TData, RouteQueryError<E>, TSelectedData, TData> & {
	queryKey: DataTag<QueryKey, TData, RouteQueryError<E>>;
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

/** Creates query options for a route, including disabled requests. */
export type RouteQueryOptionsMethod<E extends RouteDeclaration> = {
	<TData = RouteQueryData<E>>(
		...args: UseQueryArgs<E, TData>
	): QueryOptionsResultFor<E, TData>;
};

type TanstackQueryBaseRouteValue<E extends RouteDeclaration> = {
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

type TanstackQueryStreamRouteValue<E extends RouteDeclaration> = [
	ClientResponseBody<E>,
] extends [never]
	? Record<never, never>
	: ClientResponseBody<E> extends AsyncIterable<unknown>
		? {
				streamedQueryOptions: <
					TData = RouteStreamedQueryData<E>,
					TSelectedData = TData,
				>(
					...args: UseQueryArgs<E, TData> extends infer TArgs
						? TArgs extends [options?: unknown]
							? [options?: streamedQueryOptionsFor<E, TData, TSelectedData>]
							: TArgs extends [request: infer TRequest, options?: unknown]
								? [
										request: TRequest,
										options?: streamedQueryOptionsFor<E, TData, TSelectedData>,
									]
								: never
						: never
				) => streamedQueryOptionsResultFor<E, TData, TSelectedData>;
			}
		: Record<never, never>;

type TanstackQueryRouteValue<E extends RouteDeclaration> =
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
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query}
 */
export type TanstackQueryHelpersFor<T extends Contract> =
	T extends WebSocketRouteDeclaration
		? never
		: T extends { mode: "sse" }
			? never
			: T extends HttpRouteDeclaration
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

const isWebSocketRoute = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.mode === "webSocket";

const isSseRoute = (route: RouteDeclaration) => route.mode === "sse";

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
export function createTanstackQueryHelpers<
	TContract extends Contract,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: CreateTanstackQueryHelpersOptions<TGlobalHeaders>,
): TanstackQueryHelpersFor<TContract> {
	const client = initClient(contract, options);

	const mapHttpRoutes = (node: Contract, path: string[] = []): unknown => {
		if (isRouteDeclaration(node)) {
			if (isWebSocketRoute(node) || isSseRoute(node)) return undefined;

			const apiNode = getByPath(client, path) as {
				fetchResponse: FetchResponseFn<typeof node, TGlobalHeaders>;
			};

			return createRouteApi(
				node,
				path,
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

	return mapHttpRoutes(contract) as TanstackQueryHelpersFor<TContract>;
}
