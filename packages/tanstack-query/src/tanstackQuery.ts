import { initClient } from "@rest-rpc/core";
import type {
	ApiClientFetchOptions,
	ApiClientOptions,
	ClientRequestInput,
	FetchResponseFn,
	UndeclaredRouteClientResponse,
} from "@rest-rpc/core/client";
import type {
	ClientErrors,
	ClientRequest,
	ClientSuccessResponse,
	Contract,
	HttpRouteDeclaration,
	RouteDeclaration,
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

export type InferRouteQueryData<E extends RouteDeclaration> =
	ClientSuccessResponse<E> & {
		headers: Headers;
	};

export type InferRouteQueryError<E extends RouteDeclaration> =
	| (ClientErrors<E> & { headers: Headers })
	| UndeclaredRouteClientResponse
	| Error;

export type InferRouteMutationVariables<E extends RouteDeclaration> =
	ClientRequestInput<E>;

export type TanstackQueryFetchOptions = ApiClientFetchOptions;

type WithFetchOptions<T> = T & {
	fetchOptions?: TanstackQueryFetchOptions;
};

type QueryOptionsFor<
	E extends RouteDeclaration,
	TData = InferRouteQueryData<E>,
> = WithFetchOptions<
	Omit<
		QueryObserverOptions<
			InferRouteQueryData<E>,
			InferRouteQueryError<E>,
			TData
		>,
		"queryKey" | "queryFn"
	> & {
		queryKey?: QueryKey;
	}
>;

type QueryOptionsResultFor<
	E extends RouteDeclaration,
	TData = InferRouteQueryData<E>,
> = QueryObserverOptions<
	InferRouteQueryData<E>,
	InferRouteQueryError<E>,
	TData
> & {
	queryKey: DataTag<QueryKey, InferRouteQueryData<E>, InferRouteQueryError<E>>;
};

type MutationOptionsFor<E extends RouteDeclaration> = WithFetchOptions<
	Omit<
		MutationOptions<
			InferRouteQueryData<E>,
			InferRouteQueryError<E>,
			InferRouteMutationVariables<E>
		>,
		"mutationFn"
	>
>;

type InfiniteQueryOptionsFor<
	E extends RouteDeclaration,
	TData = InfiniteData<InferRouteQueryData<E>, ClientRequest<E>>,
> = WithFetchOptions<
	Omit<
		InfiniteQueryObserverOptions<
			InferRouteQueryData<E>,
			InferRouteQueryError<E>,
			TData,
			QueryKey,
			ClientRequest<E>
		>,
		"queryFn" | "queryKey" | "initialPageParam"
	> & {
		queryKey: QueryKey;
		initialPageParam: ClientRequest<E>;
	}
>;

type InfiniteQueryOptionsResultFor<
	E extends RouteDeclaration,
	TData = InfiniteData<InferRouteQueryData<E>, ClientRequest<E>>,
> = InfiniteQueryObserverOptions<
	InferRouteQueryData<E>,
	InferRouteQueryError<E>,
	TData,
	QueryKey,
	ClientRequest<E>
> & {
	queryKey: DataTag<
		QueryKey,
		InfiniteData<InferRouteQueryData<E>, ClientRequest<E>>,
		InferRouteQueryError<E>
	>;
};

type QueryDisabled = false | null | undefined | "" | 0;

type UseQueryArgs<E extends RouteDeclaration, TData = InferRouteQueryData<E>> =
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
		InferRouteQueryData<E>,
		InferRouteQueryError<E>,
		InferRouteMutationVariables<E>
	>;
	queryOptions: <TData = InferRouteQueryData<E>>(
		...args: UseQueryArgs<E, TData>
	) => QueryOptionsResultFor<E, TData>;
	infiniteQueryOptions: <
		TData = InfiniteData<InferRouteQueryData<E>, ClientRequest<E>>,
	>(
		options: InfiniteQueryOptionsFor<E, TData>,
	) => InfiniteQueryOptionsResultFor<E, TData>;
	getKey: (
		...args: GetKeyArgs<E>
	) => DataTag<QueryKey, InferRouteQueryData<E>, InferRouteQueryError<E>>;
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

export type TanstackQuery<TContract extends Contract> =
	TanstackQueryApiFor<TContract>;

const isWebSocketRoute = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.options?.mode === "websocket";

const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

const getByPath = (tree: unknown, path: string[]) =>
	path.reduce((node, key) => (node as Record<string, unknown>)[key], tree);

export const initTanstackQuery = <TContract extends Contract>(
	contract: TContract,
	options: TanstackQueryOptions,
): TanstackQuery<TContract> => {
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
				path,
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
};

export default initTanstackQuery;
