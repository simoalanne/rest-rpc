import type {
	DataTag,
	InfiniteData,
	InfiniteQueryObserverOptions,
	MutationKey,
	MutationOptions,
	QueryKey,
	QueryObserverOptions,
	SkipToken,
} from "@tanstack/query-core";

type NoInferValue<T> = [T][T extends unknown ? 0 : never];

/**
 * A route function of a client created with `createClient` or
 * `createLocalClient`.
 */
type ClientRoute = (...args: never[]) => Promise<unknown>;

/**
 * A client tree created with `createClient` or `createLocalClient`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/tanstack-query#setup}
 */
export type TanstackQueryClient =
	| ClientRoute
	| { readonly [key: string]: TanstackQueryClient };

type RouteRequestValue<F extends ClientRoute> = [Parameters<F>[0]] extends [
	undefined,
]
	? never
	: Parameters<F>[0];

type RouteDataFor<F extends ClientRoute> = Awaited<ReturnType<F>>;

// The conditional keeps editors from displaying this alias instead of the resolved union.
type RouteErrorFor<F extends ClientRoute> =
	ReturnType<F> extends { readonly "~error"?: infer TError }
		? Exclude<TError, undefined> | Error
		: Error;

type MutationVariablesFor<F extends ClientRoute> =
	RouteRequestValue<F> extends never ? undefined : RouteRequestValue<F>;

type InfiniteQueryDataFor<
	F extends ClientRoute,
	TPageParam = unknown,
> = InfiniteData<RouteDataFor<F>, TPageParam>;

type RouteResponseBody<F extends ClientRoute> =
	RouteDataFor<F> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;

type RouteStreamChunk<F extends ClientRoute> = [RouteResponseBody<F>] extends [
	never,
]
	? never
	: RouteResponseBody<F> extends AsyncIterable<infer TChunk>
		? TChunk
		: never;

type StreamedQueryDataFor<F extends ClientRoute> = [
	RouteStreamChunk<F>,
] extends [never]
	? never
	: Array<RouteStreamChunk<F>>;

// Fetch options for the fetch client, call options for the local client.
type RouteFetchOptions<F extends ClientRoute> = NonNullable<Parameters<F>[1]>;

type QueryFetchOptions<F extends ClientRoute> = Omit<
	RouteFetchOptions<F>,
	"signal"
>;
type WithFetchOptions<T, TFetchOptions> = T & { fetchOptions?: TFetchOptions };

type RequestOption<F extends ClientRoute> = [RouteRequestValue<F>] extends [
	never,
]
	? { request?: SkipToken }
	: {
			request: RouteRequestValue<F> | SkipToken;
		};

type QueryOptionsFor<
	F extends ClientRoute,
	TData = RouteDataFor<F>,
> = WithFetchOptions<
	Omit<
		QueryObserverOptions<RouteDataFor<F>, RouteErrorFor<F>, TData>,
		"queryKey" | "queryFn"
	> & {
		queryKey?: QueryKey;
	} & RequestOption<F>,
	QueryFetchOptions<F>
>;

type QueryOptionsResultFor<
	F extends ClientRoute,
	TData = RouteDataFor<F>,
> = QueryObserverOptions<RouteDataFor<F>, RouteErrorFor<F>, TData> & {
	queryKey: DataTag<QueryKey, RouteDataFor<F>, RouteErrorFor<F>>;
};

type MutationOptionsFor<F extends ClientRoute> = WithFetchOptions<
	Omit<
		MutationOptions<RouteDataFor<F>, RouteErrorFor<F>, MutationVariablesFor<F>>,
		"mutationFn"
	>,
	RouteFetchOptions<F>
>;

type MutationOptionsResultFor<F extends ClientRoute> = MutationOptions<
	RouteDataFor<F>,
	RouteErrorFor<F>,
	MutationVariablesFor<F>
> & {
	mutationKey: MutationKey;
};

type InfiniteQueryOptionsFor<
	F extends ClientRoute,
	TInitialPageParam,
	TPageParam,
	TData = InfiniteQueryDataFor<F, TPageParam>,
> = WithFetchOptions<
	Omit<
		InfiniteQueryObserverOptions<
			RouteDataFor<F>,
			RouteErrorFor<F>,
			TData,
			QueryKey,
			NoInferValue<TPageParam>
		>,
		"initialPageParam" | "queryFn" | "queryKey"
	> & {
		initialPageParam: TInitialPageParam;
		queryKey?: QueryKey;
	} & ([RouteRequestValue<F>] extends [never]
			? { request?: SkipToken }
			: {
					request:
						| ((pageParam: TPageParam) => RouteRequestValue<F>)
						| SkipToken;
				}) &
		([TInitialPageParam] extends [TPageParam] ? unknown : never),
	QueryFetchOptions<F>
>;

type InfiniteQueryOptionsResultFor<
	F extends ClientRoute,
	TPageParam,
	TData = InfiniteQueryDataFor<F, TPageParam>,
> = InfiniteQueryObserverOptions<
	RouteDataFor<F>,
	RouteErrorFor<F>,
	TData,
	QueryKey,
	TPageParam
> & {
	queryKey: DataTag<
		QueryKey,
		InfiniteQueryDataFor<F, TPageParam>,
		RouteErrorFor<F>
	>;
};

type StreamedQueryRefetchMode = "append" | "reset" | "replace";

type StreamedQueryBaseOptions = {
	refetchMode?: StreamedQueryRefetchMode;
};

type StreamedQuerySimpleOptions<
	F extends ClientRoute,
	TSelectedData,
> = StreamedQueryBaseOptions & {
	reducer?: never;
	initialValue?: never;
	streamFn?: never;
	queryKey?: QueryKey;
} & Omit<
		QueryObserverOptions<
			StreamedQueryDataFor<F>,
			RouteErrorFor<F>,
			TSelectedData,
			StreamedQueryDataFor<F>
		>,
		"queryFn" | "queryKey"
	>;

type StreamedQueryReducedOptions<
	F extends ClientRoute,
	TData,
	TSelectedData,
> = StreamedQueryBaseOptions & {
	reducer: (acc: TData, chunk: RouteStreamChunk<F>) => TData;
	initialValue: TData;
	streamFn?: never;
	queryKey?: QueryKey;
} & Omit<
		QueryObserverOptions<TData, RouteErrorFor<F>, TSelectedData, TData>,
		"queryFn" | "queryKey"
	>;

type StreamedQueryOptionsResultFor<
	F extends ClientRoute,
	TData,
	TSelectedData,
> = QueryObserverOptions<TData, RouteErrorFor<F>, TSelectedData, TData> & {
	queryKey: DataTag<QueryKey, TData, RouteErrorFor<F>>;
};

type OptionsArgument<TOptions> =
	Record<never, never> extends TOptions
		? [options?: TOptions]
		: [options: TOptions];

type StreamedSimpleQueryArgs<
	F extends ClientRoute,
	TSelectedData,
> = OptionsArgument<
	WithFetchOptions<
		StreamedQuerySimpleOptions<F, TSelectedData> & RequestOption<F>,
		QueryFetchOptions<F>
	>
>;

type StreamedReducedQueryArgs<
	F extends ClientRoute,
	TData,
	TSelectedData,
> = OptionsArgument<
	WithFetchOptions<
		StreamedQueryReducedOptions<F, TData, TSelectedData> & RequestOption<F>,
		QueryFetchOptions<F>
	>
>;

type UseQueryArgs<
	F extends ClientRoute,
	TData = RouteDataFor<F>,
> = OptionsArgument<QueryOptionsFor<F, TData>>;

// Without a request, a key is a prefix matching every query of its kind.
type QueryKeyArgs<F extends ClientRoute> = [RouteRequestValue<F>] extends [
	never,
]
	? []
	: [request?: RouteRequestValue<F>];

type RouteQueryKeyTag<F extends ClientRoute, TData> = DataTag<
	QueryKey,
	TData,
	RouteErrorFor<F>
>;

type RouteQueryOptionsMethod<F extends ClientRoute> = {
	<TData = RouteDataFor<F>>(
		...args: UseQueryArgs<F, TData>
	): QueryOptionsResultFor<F, TData>;
};

type MutationOptionsArgs<F extends ClientRoute> = OptionsArgument<
	MutationOptionsFor<F>
>;

type TanstackQueryBaseRouteValue<F extends ClientRoute> = {
	mutationOptions: (
		...args: MutationOptionsArgs<F>
	) => MutationOptionsResultFor<F>;
	queryOptions: RouteQueryOptionsMethod<F>;
	infiniteQueryOptions: <
		TInitialPageParam,
		TPageParam = TInitialPageParam,
		TData = InfiniteQueryDataFor<F, TPageParam>,
	>(
		options: InfiniteQueryOptionsFor<F, TInitialPageParam, TPageParam, TData>,
	) => InfiniteQueryOptionsResultFor<F, TPageParam, TData>;
	mutationKey: () => MutationKey;
	queryKey: (...args: QueryKeyArgs<F>) => RouteQueryKeyTag<F, RouteDataFor<F>>;
	// The request is the one of the initial page.
	infiniteQueryKey: <TPageParam = unknown>(
		...args: QueryKeyArgs<F>
	) => RouteQueryKeyTag<F, InfiniteQueryDataFor<F, TPageParam>>;
};

type IsStreamRoute<F extends ClientRoute> = [RouteResponseBody<F>] extends [
	never,
]
	? false
	: RouteResponseBody<F> extends AsyncIterable<unknown>
		? true
		: false;

type TanstackQueryStreamRouteValue<F extends ClientRoute> =
	IsStreamRoute<F> extends true
		? {
				// A reducer's cache data can be given as `TData`.
				streamedQueryKey: <TData = StreamedQueryDataFor<F>>(
					...args: QueryKeyArgs<F>
				) => RouteQueryKeyTag<F, TData>;
				streamedQueryOptions: {
					// Default accumulation fixes the cache data to the route's event array.
					<TSelectedData = StreamedQueryDataFor<F>>(
						...args: StreamedSimpleQueryArgs<F, TSelectedData>
					): StreamedQueryOptionsResultFor<
						F,
						StreamedQueryDataFor<F>,
						TSelectedData
					>;
					// A required initial value and reducer are the inference source for cache data.
					<TData, TSelectedData = TData>(
						...args: StreamedReducedQueryArgs<F, TData, TSelectedData>
					): StreamedQueryOptionsResultFor<F, TData, TSelectedData>;
				};
			}
		: Record<never, never>;

/**
 * The TanStack Query option and key utils of one client route. Streaming
 * routes also get `streamedQueryOptions`.
 */
export type TanstackQueryRouteValue<F extends ClientRoute> =
	TanstackQueryBaseRouteValue<F> & TanstackQueryStreamRouteValue<F>;

type TanstackQueryTreeFor<T> = {
	[K in keyof T]: TanstackQueryUtilsFor<T[K]>;
};

/**
 * Infers the generated TanStack Query util tree for a client.
 *
 * @remarks The util tree mirrors the client, created with `createClient` or
 * `createLocalClient`. Each route exposes query, mutation, query-key, and
 * mutation-key utils; eligible streaming routes also expose streamed query
 * options.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/tanstack-query}
 */
export type TanstackQueryUtilsFor<T> = T extends ClientRoute
	? TanstackQueryRouteValue<T>
	: TanstackQueryTreeFor<T>;
