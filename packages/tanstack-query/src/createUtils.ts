import {
	type MutationKey,
	type QueryKey,
	experimental_streamedQuery as streamedQuery,
	skipToken,
} from "@tanstack/query-core";
import type {
	ReservedKeyCheck,
	TanstackQueryClient,
	TanstackQueryUtilsFor,
} from "./createUtils.types.ts";

// The per-call options of the client's route functions.
type FetchOptions = Record<string, unknown>;

type OptionsWithFetchOptions = Record<string, unknown> & {
	fetchOptions?: FetchOptions;
	initialValue?: unknown;
	queryKey?: QueryKey;
	reducer?: (acc: unknown, chunk: unknown) => unknown;
	refetchMode?: "append" | "reset" | "replace";
	request?: unknown;
};
type TanstackQueryUtilFunctions = {
	fetch: (request?: unknown, fetchOptions?: FetchOptions) => Promise<unknown>;
	mutationOptions: (
		options?: OptionsWithFetchOptions,
	) => Record<string, unknown>;
	infiniteQueryOptions: (
		options: OptionsWithFetchOptions,
	) => Record<string, unknown>;
	queryOptions: (options?: OptionsWithFetchOptions) => Record<string, unknown>;
	streamedQueryOptions: (
		options?: OptionsWithFetchOptions,
	) => Record<string, unknown>;
	key: () => QueryKey;
	mutationKey: () => MutationKey;
	queryKey: (request?: unknown) => QueryKey;
	infiniteQueryKey: (request?: unknown) => QueryKey;
	streamedQueryKey: (request?: unknown) => QueryKey;
};

type QueryKeyKind = "query" | "infinite" | "streamed";

// Each kind caches different data, so infinite and streamed keys add a segment
// after the route path. Keys still share the route path as a prefix.
const kindSegments: Record<QueryKeyKind, readonly string[]> = {
	query: [],
	infinite: ["~infinite"],
	streamed: ["~streamed"],
};

type FetchData = (
	request: unknown,
	fetchOptions: FetchOptions | undefined,
) => Promise<unknown>;

const createUtilsForRoute = ({
	routePath,
	fetchData,
}: {
	// The prefix and the route's keys in the client tree.
	routePath: readonly unknown[];
	fetchData: FetchData;
}): TanstackQueryUtilFunctions => {
	const queryKeyFor = (kind: QueryKeyKind, request: unknown): QueryKey => {
		const key = [...routePath, ...kindSegments[kind]];
		return request === undefined || request === skipToken
			? key
			: [...key, request];
	};

	return {
		fetch: fetchData,
		mutationOptions: (options) => {
			const { fetchOptions, ...mutationOptions } = options ?? {};
			return {
				mutationKey: routePath,
				mutationFn: (request: unknown) => fetchData(request, fetchOptions),
				...mutationOptions,
			};
		},
		queryOptions: (options) => {
			const { fetchOptions, request, queryKey, ...tanstackOptions } =
				options ?? {};
			return {
				queryKey: queryKey ?? queryKeyFor("query", request),
				queryFn:
					request === skipToken
						? skipToken
						: ({ signal }: { signal?: AbortSignal }) =>
								fetchData(request, { ...fetchOptions, signal }),
				...tanstackOptions,
			};
		},
		infiniteQueryOptions: (options) => {
			const { fetchOptions, request, queryKey, ...tanstackOptions } = options;
			return {
				// The request of the initial page identifies the query, so infinite
				// queries with different inputs are cached separately.
				queryKey:
					queryKey ??
					queryKeyFor(
						"infinite",
						typeof request === "function"
							? request(tanstackOptions.initialPageParam)
							: undefined,
					),
				queryFn:
					request === skipToken
						? skipToken
						: ({
								pageParam,
								signal,
							}: {
								pageParam: unknown;
								signal?: AbortSignal;
							}) =>
								fetchData(
									typeof request === "function"
										? request(pageParam)
										: undefined,
									{ ...fetchOptions, signal },
								),
				...tanstackOptions,
			};
		},
		streamedQueryOptions: (options) => {
			const {
				fetchOptions,
				request,
				initialValue,
				reducer,
				refetchMode,
				queryKey,
				...tanstackOptions
			} = options ?? {};
			const streamFn = async ({ signal }: { signal: AbortSignal }) => {
				const { body: stream } = (await fetchData(request, {
					...fetchOptions,
					signal,
				})) as { body: AsyncIterable<unknown> };
				return stream;
			};
			return {
				queryKey: queryKey ?? queryKeyFor("streamed", request),
				queryFn:
					request === skipToken
						? skipToken
						: typeof reducer === "function"
							? streamedQuery({ refetchMode, streamFn, initialValue, reducer })
							: streamedQuery({ refetchMode, streamFn }),
				...tanstackOptions,
			};
		},
		key: () => routePath,
		mutationKey: () => routePath,
		queryKey: (request) => queryKeyFor("query", request),
		infiniteQueryKey: (request) => queryKeyFor("infinite", request),
		streamedQueryKey: (request) => queryKeyFor("streamed", request),
	};
};

const mapClientRoutes = (node: unknown, path: readonly unknown[]): unknown =>
	typeof node === "function"
		? createUtilsForRoute({ routePath: path, fetchData: node as FetchData })
		: {
				...Object.fromEntries(
					Object.entries(node as Record<string, unknown>).map(
						([key, child]) => [key, mapClientRoutes(child, [...path, key])],
					),
				),
				key: () => path,
			};

/**
 * Creates a TanStack Query util tree that mirrors a client.
 *
 * @remarks Accepts a client created with `createClient`. Generated utils call the client's routes, create
 * options and stable query keys; they do not create a `QueryClient` or call
 * framework-specific hooks. Every node of the tree has `key()`, the key that
 * matches all of its queries, so `key` is reserved in the client tree.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/tanstack-query#setup}
 */
export function createTanstackQueryUtils<TClient extends TanstackQueryClient>(
	client: TClient & ReservedKeyCheck<TClient>,
	options: {
		/**
		 * Keys that start every query and mutation key of the utils, such as
		 * values sent with every request that change its response.
		 */
		prefix?: QueryKey;
	} = {},
): TanstackQueryUtilsFor<TClient> {
	return mapClientRoutes(client, [
		...(options.prefix ?? []),
	]) as TanstackQueryUtilsFor<TClient>;
}
