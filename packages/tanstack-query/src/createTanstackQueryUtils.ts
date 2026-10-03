import {
	initClient,
	type HttpError,
	type InferClientError as InferDeclaredClientError,
	type InferClientRequest,
	type InferClientSuccess,
} from "@rest-rpc/core";
import type {
	ApiClientOptions,
	ClientHeaders,
	FetchArgs,
	FetchOptions,
	FetchOptionsFor,
} from "@rest-rpc/core/client";
import type {
	Contract,
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

type NoInferValue<T> = [T][T extends unknown ? 0 : never];

type QueryRoute = { readonly "~restrpc": RouteDeclaration };

type RouteFor<E extends QueryRoute> = E["~restrpc"];

type DeclaredRouteResponseBody<E extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<E> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;

type RouteRequestValue<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = [InferClientRequest<E>] extends [undefined]
	? never
	: FetchArgs<RouteFor<E>, TGlobalHeaders>[0];

type RouteDataFor<E extends QueryRoute> = InferClientSuccess<E>;

// The conditional keeps editors from displaying this alias instead of the resolved union.
type RouteErrorFor<E extends QueryRoute> = E extends unknown
	? InferDeclaredClientError<E> | HttpError | Error
	: never;

/**
 * Infers the `error` of a route's generated query and mutation options.
 *
 * @remarks Includes the declared non-2xx responses, `HttpError`, and `Error`.
 * The `InferClientError` from `@rest-rpc/core` contains only the declared
 * non-2xx responses. Pass a route tree to infer a matching tree of types.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#type-helpers}
 */
export type InferClientError<T extends RouteTree> = T extends QueryRoute
	? RouteErrorFor<T>
	: {
			[K in keyof T]: T[K] extends RouteTree ? InferClientError<T[K]> : never;
		};

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
> = InfiniteData<RouteDataFor<E>, TPageParam>;

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
	TData = RouteDataFor<E>,
> = WithFetchOptions<
	Omit<
		QueryObserverOptions<RouteDataFor<E>, RouteErrorFor<E>, TData>,
		"queryKey" | "queryFn"
	> & {
		queryKey?: QueryKey;
	} & RequestOption<E, TGlobalHeaders>,
	QueryFetchOptions<E>
>;

type QueryOptionsResultFor<
	E extends QueryRoute,
	TData = RouteDataFor<E>,
> = QueryObserverOptions<RouteDataFor<E>, RouteErrorFor<E>, TData> & {
	queryKey: DataTag<QueryKey, RouteDataFor<E>, RouteErrorFor<E>>;
};

type MutationOptionsFor<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders,
> = WithFetchOptions<
	Omit<
		MutationOptions<
			RouteDataFor<E>,
			RouteErrorFor<E>,
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
	RouteDataFor<E>,
	RouteErrorFor<E>,
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
			RouteDataFor<E>,
			RouteErrorFor<E>,
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
	RouteDataFor<E>,
	RouteErrorFor<E>,
	TData,
	QueryKey,
	TPageParam
> & {
	queryKey: DataTag<
		QueryKey,
		InfiniteQueryDataFor<E, TPageParam>,
		RouteErrorFor<E>
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
			RouteErrorFor<E>,
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
		QueryObserverOptions<TData, RouteErrorFor<E>, TSelectedData, TData>,
		"queryFn" | "queryKey"
	>;

type streamedQueryOptionsResultFor<
	E extends QueryRoute,
	TData,
	TSelectedData,
> = QueryObserverOptions<TData, RouteErrorFor<E>, TSelectedData, TData> & {
	queryKey: DataTag<QueryKey, TData, RouteErrorFor<E>>;
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
	TData = RouteDataFor<E>,
> = OptionsArgument<QueryOptionsFor<E, TGlobalHeaders, TData>>;

type QueryKeyArgs<E extends QueryRoute, TGlobalHeaders extends ClientHeaders> =
	RouteRequestValue<E, TGlobalHeaders> extends never
		? []
		: [request: RouteRequestValue<E, TGlobalHeaders>];

type RouteQueryOptionsMethod<
	E extends QueryRoute,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = {
	<TData = RouteDataFor<E>>(
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
	) => DataTag<QueryKey, RouteDataFor<E>, RouteErrorFor<E>>;
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
