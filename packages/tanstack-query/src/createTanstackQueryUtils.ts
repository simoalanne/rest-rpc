import { initClient, type HttpError } from "@rest-rpc/core";
import type {
	ApiClientOptions,
	ClientHeaders,
	FetchArgs,
	FetchOptions,
	FetchOptionsFor,
	InferClientResponse,
} from "@rest-rpc/core/client";
import type {
	Contract,
	ErrorDeclaredClientResponse,
	InferClientRequest,
	RouteDeclaration,
	SuccessfulDeclaredClientResponse,
} from "@rest-rpc/core/contract";
import type {
	DataTag,
	InfiniteData,
	InfiniteQueryObserverOptions,
	MutationKey,
	MutationOptions,
	QueryKey,
	QueryObserverOptions,
	skipToken,
} from "@tanstack/query-core";
import { createTanstackUtilsForRoute } from "./createUtils.ts";

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;
type NoInferValue<T> = [T][T extends unknown ? 0 : never];

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
	| HttpError
	| Error;
type DeclaredRouteResponseBody<E extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<E> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;

type RouteRequestValue<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> =
	InferClientRequest<E> extends never
		? never
		: FetchArgs<RouteFor<E>, TGlobalHeaders>[0];

type IsPlainOutput<E extends RouteDeclaration> = E extends {
	output: "output";
}
	? true
	: false;

/**
 * Infers the successful query data returned for a route.
 *
 * @remarks HTTP routes retain their response envelope and include only 2xx
 * statuses. Procedure routes produce their output value directly.
 */
export type RouteQueryData<E extends QueryRoute> =
	IsPlainOutput<RouteFor<E>> extends true
		? InferClientResponse<E>
		: DeclaredRouteQueryData<RouteFor<E>>;

/**
 * Infers the error value surfaced by generated TanStack Query options.
 *
 * @remarks HTTP routes include declared non-2xx response envelopes, `HttpError`,
 * and `Error`. Plain output routes surface `HttpError` and `Error`.
 */
export type RouteQueryError<E extends QueryRoute> =
	IsPlainOutput<RouteFor<E>> extends true
		? HttpError | Error
		: DeclaredRouteQueryError<RouteFor<E>>;

/**
 * Infers mutation variables for a route.
 */
export type RouteMutationVariables<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> =
	RouteRequestValue<E, TGlobalHeaders> extends never
		? undefined
		: RouteRequestValue<E, TGlobalHeaders>;

/**
 * Infers infinite query data for a route.
 *
 * @remarks Each page contains a successful route result. Page parameters are
 * mapped to route requests by the infinite query's `request` callback.
 */
export type RouteInfiniteQueryData<
	E extends QueryRoute,
	TPageParam = unknown,
> = InfiniteData<RouteQueryData<E>, TPageParam>;

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
 * @remarks The default accumulator materializes SSE events into an array
 * and omits the HTTP response envelope.
 */
export type RouteStreamedQueryData<E extends QueryRoute> = [
	RouteStreamChunk<E>,
] extends [never]
	? never
	: Array<RouteStreamChunk<E>>;

type QueryFetchOptions<E extends QueryRoute> = Omit<
	FetchOptionsFor<RouteFor<E>>,
	"signal"
>;

type MutationFetchOptions<E extends QueryRoute> = FetchOptionsFor<RouteFor<E>>;

type WithFetchOptions<T, TFetchOptions> = T &
	(TFetchOptions extends { contentType: string }
		? { fetchOptions: TFetchOptions }
		: { fetchOptions?: TFetchOptions });

type RequestOption<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = [RouteRequestValue<E, TGlobalHeaders>] extends [never]
	? { request?: typeof skipToken }
	: {
			request: RouteRequestValue<E, TGlobalHeaders> | typeof skipToken;
		};

type QueryOptionsFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
	TData = RouteQueryData<E>,
> = WithFetchOptions<
	Omit<
		QueryObserverOptions<RouteQueryData<E>, RouteQueryError<E>, TData>,
		"queryKey" | "queryFn"
	> & {
		queryKey?: QueryKey;
	} & RequestOption<E, TGlobalHeaders>,
	QueryFetchOptions<E>
>;

type QueryOptionsResultFor<
	E extends QueryRoute,
	TData = RouteQueryData<E>,
> = QueryObserverOptions<RouteQueryData<E>, RouteQueryError<E>, TData> & {
	queryKey: DataTag<QueryKey, RouteQueryData<E>, RouteQueryError<E>>;
};

type MutationOptionsFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = WithFetchOptions<
	Omit<
		MutationOptions<
			RouteQueryData<E>,
			RouteQueryError<E>,
			RouteMutationVariables<E, TGlobalHeaders>
		>,
		"mutationFn"
	>,
	MutationFetchOptions<E>
>;

type MutationOptionsResultFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = MutationOptions<
	RouteQueryData<E>,
	RouteQueryError<E>,
	RouteMutationVariables<E, TGlobalHeaders>
> & {
	mutationKey: MutationKey;
};

type InfiniteQueryOptionsFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
	TInitialPageParam,
	TPageParam,
	TData = RouteInfiniteQueryData<E, TPageParam>,
> = WithFetchOptions<
	Omit<
		InfiniteQueryObserverOptions<
			RouteQueryData<E>,
			RouteQueryError<E>,
			TData,
			QueryKey,
			NoInferValue<TPageParam>
		>,
		"initialPageParam" | "queryFn" | "queryKey"
	> & {
		initialPageParam: TInitialPageParam;
		queryKey?: QueryKey;
	} & ([RouteRequestValue<E, TGlobalHeaders>] extends [never]
			? { request?: typeof skipToken }
			: {
					request:
						| ((pageParam: TPageParam) => RouteRequestValue<E, TGlobalHeaders>)
						| typeof skipToken;
				}) &
		([TInitialPageParam] extends [TPageParam] ? unknown : never),
	QueryFetchOptions<E>
>;

type InfiniteQueryOptionsResultFor<
	E extends QueryRoute,
	TPageParam,
	TData = RouteInfiniteQueryData<E, TPageParam>,
> = InfiniteQueryObserverOptions<
	RouteQueryData<E>,
	RouteQueryError<E>,
	TData,
	QueryKey,
	TPageParam
> & {
	queryKey: DataTag<
		QueryKey,
		RouteInfiniteQueryData<E, TPageParam>,
		RouteQueryError<E>
	>;
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

type streamedQueryOptionsResultFor<
	E extends QueryRoute,
	TData,
	TSelectedData,
> = QueryObserverOptions<TData, RouteQueryError<E>, TSelectedData, TData> & {
	queryKey: DataTag<QueryKey, TData, RouteQueryError<E>>;
};

type OptionsArgument<TOptions> =
	Record<never, never> extends TOptions
		? [options?: TOptions]
		: [options: TOptions];

type StreamedSimpleQueryArgs<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
	TSelectedData,
> = OptionsArgument<
	WithFetchOptions<
		StreamedQuerySimpleOptions<E, TSelectedData> &
			RequestOption<E, TGlobalHeaders>,
		QueryFetchOptions<E>
	>
>;

type StreamedReducedQueryArgs<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
	TData,
	TSelectedData,
> = OptionsArgument<
	WithFetchOptions<
		StreamedQueryReducedOptions<E, TData, TSelectedData> &
			RequestOption<E, TGlobalHeaders>,
		QueryFetchOptions<E>
	>
>;

type UseQueryArgs<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
	TData = RouteQueryData<E>,
> = OptionsArgument<QueryOptionsFor<E, TGlobalHeaders, TData>>;

type QueryKeyArgs<E extends QueryRoute, TGlobalHeaders extends ClientHeaders> =
	RouteRequestValue<E, TGlobalHeaders> extends never
		? []
		: [request: RouteRequestValue<E, TGlobalHeaders>];

/**
 * Describes the typed `queryOptions()` method available for a route.
 *
 * @remarks Passing TanStack Query's `skipToken` as `request`
 * produces disabled query options without losing route type safety.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#queries}
 */
export type RouteQueryOptionsMethod<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = {
	<TData = RouteQueryData<E>>(
		...args: UseQueryArgs<E, TGlobalHeaders, TData>
	): QueryOptionsResultFor<E, TData>;
};

type MutationOptionsArgs<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = OptionsArgument<MutationOptionsFor<E, TGlobalHeaders>>;

type TanstackQueryBaseRouteValue<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = {
	mutationOptions: (
		...args: MutationOptionsArgs<E, TGlobalHeaders>
	) => MutationOptionsResultFor<E, TGlobalHeaders>;
	queryOptions: RouteQueryOptionsMethod<E, TGlobalHeaders>;
	infiniteQueryOptions: <
		TInitialPageParam,
		TPageParam = TInitialPageParam,
		TData = RouteInfiniteQueryData<E, TPageParam>,
	>(
		options: InfiniteQueryOptionsFor<
			E,
			TGlobalHeaders,
			TInitialPageParam,
			TPageParam,
			TData
		>,
	) => InfiniteQueryOptionsResultFor<E, TPageParam, TData>;
	mutationKey: () => MutationKey;
	queryKey: (
		...args: QueryKeyArgs<E, TGlobalHeaders>
	) => DataTag<QueryKey, RouteQueryData<E>, RouteQueryError<E>>;
};

type TanstackQueryStreamRouteValue<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = [DeclaredRouteResponseBody<RouteFor<E>>] extends [never]
	? Record<never, never>
	: DeclaredRouteResponseBody<RouteFor<E>> extends AsyncIterable<unknown>
		? {
				streamedQueryOptions: {
					// Default accumulation fixes the cache data to the route's event array.
					<TSelectedData = RouteStreamedQueryData<E>>(
						...args: StreamedSimpleQueryArgs<E, TGlobalHeaders, TSelectedData>
					): streamedQueryOptionsResultFor<
						E,
						RouteStreamedQueryData<E>,
						TSelectedData
					>;
					// A required initial value and reducer are the inference source for cache data.
					<TData, TSelectedData = TData>(
						...args: StreamedReducedQueryArgs<
							E,
							TGlobalHeaders,
							TData,
							TSelectedData
						>
					): streamedQueryOptionsResultFor<E, TData, TSelectedData>;
				};
			}
		: Record<never, never>;

type TanstackQueryRouteValue<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = TanstackQueryBaseRouteValue<E, TGlobalHeaders> &
	TanstackQueryStreamRouteValue<E, TGlobalHeaders>;

type TanstackQueryTreeFor<
	T extends Contract,
	TGlobalHeaders extends ClientHeaders,
> = {
	[K in keyof T]: T[K] extends Contract
		? TanstackQueryUtilsFor<T[K], TGlobalHeaders>
		: never;
};

/**
 * Infers the generated TanStack Query util tree for a contract.
 *
 * @remarks The util tree mirrors the contract. Each route exposes query,
 * mutation, query-key, and mutation-key utils; eligible streaming routes
 * also expose streamed query options.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query}
 */
export type TanstackQueryUtilsFor<
	T extends Contract,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = T extends QueryRoute
	? TanstackQueryRouteValue<T, TGlobalHeaders>
	: TanstackQueryTreeFor<T, TGlobalHeaders>;

/**
 * Options used to create TanStack Query utils from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#setup}
 */
export type CreateTanstackQueryUtilsOptions<
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = ApiClientOptions<TGlobalHeaders>;

const isRouteDeclaration = (
	value: unknown,
): value is { readonly "~restrpc": RouteDeclaration } =>
	typeof value === "object" && value !== null && "~restrpc" in value;

const fetchSuccessfulResponse = async (
	fetchResponse: (...args: unknown[]) => Promise<unknown>,
	request: unknown,
	options?: FetchOptions,
) => {
	let response: { status: number; headers?: Headers; body?: unknown };
	try {
		response = (await fetchResponse(request, options)) as typeof response;
	} catch (error) {
		throw error instanceof Error
			? error
			: new Error("API request failed", { cause: error });
	}

	if (response.status < 200 || response.status >= 300) {
		throw response;
	}

	return response;
};

/**
 * Creates a TanStack Query util tree that mirrors a contract.
 *
 * @remarks Generated utils create options and stable query keys; they do not
 * create a `QueryClient` or call framework-specific hooks.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#setup}
 */
export function createTanstackQueryUtils<
	TContract extends Contract,
	const TGlobalHeaders extends ClientHeaders = Record<never, string>,
>(
	contract: TContract,
	options: CreateTanstackQueryUtilsOptions<TGlobalHeaders>,
): TanstackQueryUtilsFor<TContract, TGlobalHeaders> {
	const client = initClient(contract, options);

	const buildTanstackQueryUtils = (
		node: Contract,
		clientNode: unknown,
		path: string[] = [],
	): unknown => {
		if (isRouteDeclaration(node)) {
			const route = node["~restrpc"];
			const routeFetchFn = clientNode as (
				...args: unknown[]
			) => Promise<unknown>;

			const returnsResponseEnvelope = route.output === "response";

			return createTanstackUtilsForRoute({
				routePath: path,
				fetchData: returnsResponseEnvelope
					? (request, fetchOptions) =>
							fetchSuccessfulResponse(routeFetchFn, request, fetchOptions)
					: routeFetchFn,
				unwrapResponseBodyForStream: returnsResponseEnvelope,
			});
		}

		const client = clientNode as Record<string, unknown>;

		return Object.fromEntries(
			Object.entries(node).map(([key, value]) => [
				key,
				buildTanstackQueryUtils(value, client[key], [...path, key]),
			]),
		);
	};

	return buildTanstackQueryUtils(contract, client) as TanstackQueryUtilsFor<
		TContract,
		TGlobalHeaders
	>;
}
