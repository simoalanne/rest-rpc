import { createClient } from "@rest-rpc/core";
import type {
	ApiClientOptions,
	ClientHeaders,
	FetchOptions,
} from "@rest-rpc/core/client";
import { mapContractRoutes, type Contract } from "@rest-rpc/core/contract";
import {
	type MutationKey,
	type QueryKey,
	experimental_streamedQuery as streamedQuery,
	skipToken,
} from "@tanstack/query-core";
import type { TanstackQueryUtilsFor } from "./createUtils.types.ts";

type OptionsWithFetchOptions = Record<string, unknown> & {
	fetchOptions?: FetchOptions;
	initialValue?: unknown;
	queryKey?: QueryKey;
	reducer?: (acc: unknown, chunk: unknown) => unknown;
	refetchMode?: "append" | "reset" | "replace";
	request?: unknown;
};
type TanstackQueryUtilFunctions = {
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
	mutationKey: () => MutationKey;
	queryKey: (request?: unknown) => QueryKey;
};

type FetchData = (
	request: unknown,
	fetchOptions: FetchOptions | undefined,
) => Promise<unknown>;

const createUtilsForRoute = ({
	routePath,
	fetchData,
}: {
	routePath: string[];
	fetchData: FetchData;
}): TanstackQueryUtilFunctions => {
	const queryKeyFor = (request: unknown): QueryKey =>
		request === undefined || request === skipToken
			? routePath
			: [...routePath, request];

	return {
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
				queryKey: queryKey ?? queryKeyFor(request),
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
				queryKey: queryKey ?? routePath,
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
				queryKey: queryKey ?? queryKeyFor(request),
				queryFn:
					request === skipToken
						? skipToken
						: typeof reducer === "function"
							? streamedQuery({ refetchMode, streamFn, initialValue, reducer })
							: streamedQuery({ refetchMode, streamFn }),
				...tanstackOptions,
			};
		},
		mutationKey: () => routePath,
		queryKey: queryKeyFor,
	};
};

/**
 * Options used to create TanStack Query utils from a contract.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/tanstack-query#setup}
 */
export type CreateTanstackQueryUtilsOptions<
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = ApiClientOptions<TGlobalHeaders>;

/**
 * Creates a TanStack Query util tree that mirrors a contract.
 *
 * @remarks Generated utils create options and stable query keys; they do not
 * create a `QueryClient` or call framework-specific hooks.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/tanstack-query#setup}
 */
export function createTanstackQueryUtils<
	TContract extends Contract,
	const TGlobalHeaders extends ClientHeaders = Record<never, string>,
>(
	contract: TContract,
	options: CreateTanstackQueryUtilsOptions<TGlobalHeaders>,
): TanstackQueryUtilsFor<TContract, TGlobalHeaders> {
	const client: unknown = createClient(contract, options);

	return mapContractRoutes(contract, (_route, path) => {
		const routeFetchFn = path.reduce(
			(node, key) => (node as Record<string, unknown>)[key],
			client,
		) as (...args: unknown[]) => Promise<unknown>;
		return createUtilsForRoute({
			routePath: path,
			fetchData: (request, fetchOptions) => routeFetchFn(request, fetchOptions),
		});
	}) as TanstackQueryUtilsFor<TContract, TGlobalHeaders>;
}
