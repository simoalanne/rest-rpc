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
	RouteTree,
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

type QueryDataFor<E extends QueryRoute> =
	IsPlainOutput<RouteFor<E>> extends true
		? InferClientResponse<E>
		: DeclaredRouteQueryData<RouteFor<E>>;

type QueryErrorFor<E extends QueryRoute> =
	IsPlainOutput<RouteFor<E>> extends true
		? HttpError | Error
		: DeclaredRouteQueryError<RouteFor<E>>;

type MutationVariablesFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> =
	RouteRequestValue<E, TGlobalHeaders> extends never
		? undefined
		: RouteRequestValue<E, TGlobalHeaders>;

type InfiniteQueryDataFor<
	E extends QueryRoute,
	TPageParam = unknown,
> = InfiniteData<QueryDataFor<E>, TPageParam>;

type RouteStreamChunk<E extends QueryRoute> = [
	DeclaredRouteResponseBody<RouteFor<E>>,
] extends [never]
	? never
	: DeclaredRouteResponseBody<RouteFor<E>> extends AsyncIterable<infer TChunk>
		? TChunk
		: never;

type StreamedQueryDataFor<E extends QueryRoute> = [
	RouteStreamChunk<E>,
] extends [never]
	? never
	: Array<RouteStreamChunk<E>>;

/**
 * Infers the successful query data returned for a route.
 *
 * @remarks HTTP routes retain their response envelope and include only 2xx
 * statuses. Procedure routes produce their output value directly. Pass a route
 * tree to infer a matching tree of types.
 */
export type InferQueryData<T extends RouteTree> = T extends QueryRoute
	? QueryDataFor<T>
	: { [K in keyof T]: T[K] extends RouteTree ? InferQueryData<T[K]> : never };

/**
 * Infers the error value surfaced by generated TanStack Query options.
 *
 * @remarks HTTP routes include declared non-2xx response envelopes, `HttpError`,
 * and `Error`. Plain output routes surface `HttpError` and `Error`. Pass a route
 * tree to infer a matching tree of types.
 */
export type InferQueryError<T extends RouteTree> = T extends QueryRoute
	? QueryErrorFor<T>
	: { [K in keyof T]: T[K] extends RouteTree ? InferQueryError<T[K]> : never };

/**
 * Infers mutation variables for a route.
 *
 * @remarks Pass a route tree to infer a matching tree of types.
 */
export type InferMutationVariables<
	T extends RouteTree,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = T extends QueryRoute
	? MutationVariablesFor<T, TGlobalHeaders>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferMutationVariables<T[K], TGlobalHeaders>
				: never;
		};

/**
 * Infers infinite query data for a route.
 *
 * @remarks Each page contains a successful route result. Page parameters are
 * mapped to route requests by the infinite query's `request` callback. Pass a route
 * tree to infer a matching tree of types.
 */
export type InferInfiniteQueryData<
	T extends RouteTree,
	TPageParam = unknown,
> = T extends QueryRoute
	? InfiniteQueryDataFor<T, TPageParam>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferInfiniteQueryData<T[K], TPageParam>
				: never;
		};

/**
 * Infers the accumulated data returned by generated stream query options.
 *
 * @remarks The default accumulator materializes SSE events into an array
 * and omits the HTTP response envelope. Pass a route
 * tree to infer a matching tree of types.
 */
export type InferStreamedQueryData<T extends RouteTree> = T extends QueryRoute
	? StreamedQueryDataFor<T>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferStreamedQueryData<T[K]>
				: never;
		};

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
	TData = QueryDataFor<E>,
> = WithFetchOptions<
	Omit<
		QueryObserverOptions<QueryDataFor<E>, QueryErrorFor<E>, TData>,
		"queryKey" | "queryFn"
	> & {
		queryKey?: QueryKey;
	} & RequestOption<E, TGlobalHeaders>,
	QueryFetchOptions<E>
>;

type QueryOptionsResultFor<
	E extends QueryRoute,
	TData = QueryDataFor<E>,
> = QueryObserverOptions<QueryDataFor<E>, QueryErrorFor<E>, TData> & {
	queryKey: DataTag<QueryKey, QueryDataFor<E>, QueryErrorFor<E>>;
};

type MutationOptionsFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = WithFetchOptions<
	Omit<
		MutationOptions<
			QueryDataFor<E>,
			QueryErrorFor<E>,
			MutationVariablesFor<E, TGlobalHeaders>
		>,
		"mutationFn"
	>,
	MutationFetchOptions<E>
>;

type MutationOptionsResultFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = MutationOptions<
	QueryDataFor<E>,
	QueryErrorFor<E>,
	MutationVariablesFor<E, TGlobalHeaders>
> & {
	mutationKey: MutationKey;
};

type InfiniteQueryOptionsFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
	TInitialPageParam,
	TPageParam,
	TData = InfiniteQueryDataFor<E, TPageParam>,
> = WithFetchOptions<
	Omit<
		InfiniteQueryObserverOptions<
			QueryDataFor<E>,
			QueryErrorFor<E>,
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
	TData = InfiniteQueryDataFor<E, TPageParam>,
> = InfiniteQueryObserverOptions<
	QueryDataFor<E>,
	QueryErrorFor<E>,
	TData,
	QueryKey,
	TPageParam
> & {
	queryKey: DataTag<
		QueryKey,
		InfiniteQueryDataFor<E, TPageParam>,
		QueryErrorFor<E>
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
			StreamedQueryDataFor<E>,
			QueryErrorFor<E>,
			TSelectedData,
			StreamedQueryDataFor<E>
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
		QueryObserverOptions<TData, QueryErrorFor<E>, TSelectedData, TData>,
		"queryFn" | "queryKey"
	>;

type streamedQueryOptionsResultFor<
	E extends QueryRoute,
	TData,
	TSelectedData,
> = QueryObserverOptions<TData, QueryErrorFor<E>, TSelectedData, TData> & {
	queryKey: DataTag<QueryKey, TData, QueryErrorFor<E>>;
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
	TData = QueryDataFor<E>,
> = OptionsArgument<QueryOptionsFor<E, TGlobalHeaders, TData>>;

type QueryKeyArgs<E extends QueryRoute, TGlobalHeaders extends ClientHeaders> =
	RouteRequestValue<E, TGlobalHeaders> extends never
		? []
		: [request: RouteRequestValue<E, TGlobalHeaders>];

type RouteQueryOptionsMethod<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = {
	<TData = QueryDataFor<E>>(
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
		TData = InfiniteQueryDataFor<E, TPageParam>,
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
	) => DataTag<QueryKey, QueryDataFor<E>, QueryErrorFor<E>>;
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
					<TSelectedData = StreamedQueryDataFor<E>>(
						...args: StreamedSimpleQueryArgs<E, TGlobalHeaders, TSelectedData>
					): streamedQueryOptionsResultFor<
						E,
						StreamedQueryDataFor<E>,
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
