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
	ClientResponse<E, false>,
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
export type RouteQueryError<
	E extends RouteDeclaration,
	TStrictStatusCodes extends boolean = false,
> =
	| (ErrorDeclaredClientResponse<E> & { headers: Headers })
	| (TStrictStatusCodes extends true ? never : ClientUndeclaredResponse<E>)
	| Error;

/**
 * Infers the error value surfaced by generated TanStack Query options with strict status codes enabled.
 *
 * @remarks Unlike `RouteQueryError`, this type excludes undeclared response envelopes.
 * This matches generated TanStack Query helpers when `strictStatusCodes` is set to `true`.
 * @see {@link https://rest-rpc.dev/docs/type-helpers#tanstack-query}
 */
export type StrictRouteQueryError<E extends RouteDeclaration> = RouteQueryError<
	E,
	true
>;

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
	TStrictStatusCodes extends boolean,
	TData = RouteQueryData<E>,
> = WithFetchOptions<
	Omit<
		QueryObserverOptions<
			RouteQueryData<E>,
			RouteQueryError<E, TStrictStatusCodes>,
			TData
		>,
		"queryKey" | "queryFn"
	> & {
		queryKey?: QueryKey;
	}
>;

type QueryOptionsResultFor<
	E extends RouteDeclaration,
	TStrictStatusCodes extends boolean,
	TData = RouteQueryData<E>,
> = QueryObserverOptions<
	RouteQueryData<E>,
	RouteQueryError<E, TStrictStatusCodes>,
	TData
> & {
	queryKey: DataTag<
		QueryKey,
		RouteQueryData<E>,
		RouteQueryError<E, TStrictStatusCodes>
	>;
};

type MutationOptionsFor<
	E extends RouteDeclaration,
	TStrictStatusCodes extends boolean,
> = WithFetchOptions<
	Omit<
		MutationOptions<
			RouteQueryData<E>,
			RouteQueryError<E, TStrictStatusCodes>,
			RouteMutationVariables<E>
		>,
		"mutationFn"
	>
>;

type InfiniteQueryOptionsFor<
	E extends RouteDeclaration,
	TStrictStatusCodes extends boolean,
	TData = RouteInfiniteQueryData<E>,
> = WithFetchOptions<
	Omit<
		InfiniteQueryObserverOptions<
			RouteQueryData<E>,
			RouteQueryError<E, TStrictStatusCodes>,
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
	TStrictStatusCodes extends boolean,
	TData = RouteInfiniteQueryData<E>,
> = InfiniteQueryObserverOptions<
	RouteQueryData<E>,
	RouteQueryError<E, TStrictStatusCodes>,
	TData,
	QueryKey,
	ClientRequest<E>
> & {
	queryKey: DataTag<
		QueryKey,
		RouteInfiniteQueryData<E>,
		RouteQueryError<E, TStrictStatusCodes>
	>;
};

type QueryDisabled = false | null | undefined | "" | 0;

type UseQueryArgs<
	E extends RouteDeclaration,
	TStrictStatusCodes extends boolean,
	TData = RouteQueryData<E>,
> =
	ClientRequest<E> extends never
		? [options?: QueryOptionsFor<E, TStrictStatusCodes, TData>]
		: [
				request: ClientRequest<E> | QueryDisabled | SkipToken,
				options?: QueryOptionsFor<E, TStrictStatusCodes, TData>,
			];

type GetKeyArgs<E extends RouteDeclaration> =
	ClientRequest<E> extends never ? [] : [request: ClientRequest<E>];

type TanstackQueryRouteValue<
	E extends RouteDeclaration,
	TStrictStatusCodes extends boolean,
> = {
	mutationOptions: (
		options?: MutationOptionsFor<E, TStrictStatusCodes>,
	) => MutationOptions<
		RouteQueryData<E>,
		RouteQueryError<E, TStrictStatusCodes>,
		RouteMutationVariables<E>
	>;
	queryOptions: <TData = RouteQueryData<E>>(
		...args: UseQueryArgs<E, TStrictStatusCodes, TData>
	) => QueryOptionsResultFor<E, TStrictStatusCodes, TData>;
	infiniteQueryOptions: <TData = RouteInfiniteQueryData<E>>(
		options: InfiniteQueryOptionsFor<E, TStrictStatusCodes, TData>,
	) => InfiniteQueryOptionsResultFor<E, TStrictStatusCodes, TData>;
	getKey: (
		...args: GetKeyArgs<E>
	) => DataTag<
		QueryKey,
		RouteQueryData<E>,
		RouteQueryError<E, TStrictStatusCodes>
	>;
};

type TanstackQueryTreeFor<
	T extends Contract,
	TStrictStatusCodes extends boolean,
> = {
	[
		K in keyof T as T[K] extends Contract
			? TanstackQueryHelpersFor<T[K], TStrictStatusCodes> extends never
				? never
				: keyof TanstackQueryHelpersFor<T[K], TStrictStatusCodes> extends never
					? never
					: K
			: never
	]: T[K] extends Contract
		? TanstackQueryHelpersFor<T[K], TStrictStatusCodes>
		: never;
};

/**
 * Infers the generated TanStack Query helper tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query}
 */
export type TanstackQueryHelpersFor<
	T extends Contract,
	TStrictStatusCodes extends boolean = false,
> = T extends WebSocketRouteDeclaration
	? never
	: T extends HttpRouteDeclaration
		? TanstackQueryRouteValue<T, TStrictStatusCodes>
		: TanstackQueryTreeFor<T, TStrictStatusCodes>;

/**
 * Infers the generated TanStack Query helper tree for a contract with strict status codes enabled.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query}
 */
export type StrictTanstackQueryHelpersFor<TContract extends Contract> =
	TanstackQueryHelpersFor<TContract, true>;

/**
 * Options used to create TanStack Query helpers from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/tanstack-query#setup}
 */
export type CreateTanstackQueryHelpersOptions<
	TStrictStatusCodes extends boolean = false,
	TGlobalHeaders extends Record<string, string> = Record<never, string>,
> = ApiClientOptions<TStrictStatusCodes, TGlobalHeaders>;

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
export function createTanstackQueryHelpers<
	TContract extends Contract,
	const TStrictStatusCodes extends boolean = false,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: CreateTanstackQueryHelpersOptions<
		TStrictStatusCodes,
		TGlobalHeaders
	>,
): TanstackQueryHelpersFor<TContract, TStrictStatusCodes> {
	const client = initClient(contract, options);

	const mapHttpRoutes = (node: Contract, path: string[] = []): unknown => {
		if (isRouteDeclaration(node)) {
			if (isWebSocketRoute(node)) return undefined;

			const apiNode = getByPath(client, path) as {
				fetchResponse: FetchResponseFn<
					typeof node,
					TStrictStatusCodes,
					TGlobalHeaders
				>;
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

	return mapHttpRoutes(contract) as TanstackQueryHelpersFor<
		TContract,
		TStrictStatusCodes
	>;
}
