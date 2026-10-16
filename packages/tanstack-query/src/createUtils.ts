import type { FetchOptions } from "@rest-rpc/core/client";
import {
	type MutationKey,
	type QueryKey,
	experimental_streamedQuery as streamedQuery,
	skipToken,
} from "@tanstack/query-core";

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

export const createTanstackUtilsForRoute = ({
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
