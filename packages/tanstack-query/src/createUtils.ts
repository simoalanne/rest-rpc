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
export type TanstackQueryUtilFunctions = {
	mutationOptions: (
		options?: OptionsWithFetchOptions,
	) => Record<string, unknown>;
	infiniteQueryOptions: (
		options: OptionsWithFetchOptions,
	) => Record<string, unknown>;
	queryOptions: (options?: OptionsWithFetchOptions) => Record<string, unknown>;
	streamedQueryOptions?: (
		options?: OptionsWithFetchOptions,
	) => Record<string, unknown>;
	mutationKey: () => MutationKey;
	queryKey: (request?: unknown) => QueryKey;
};

type FetchData = (
	request: unknown,
	fetchOptions: FetchOptions | undefined,
) => Promise<unknown>;

const splitFetchOptions = (options?: OptionsWithFetchOptions) => {
	const { fetchOptions, ...queryOptions } = options ?? {};
	return {
		fetchOptions,
		queryOptions,
	};
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
	typeof value === "object" &&
	value !== null &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";

export const createTanstackUtilsForRoute = ({
	routePath,
	fetchData,
	unwrapResponseBodyForStream = false,
}: {
	routePath: string[];
	fetchData: FetchData;
	unwrapResponseBodyForStream?: boolean;
}): TanstackQueryUtilFunctions => {
	const utils: TanstackQueryUtilFunctions = {
		mutationOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			return {
				mutationKey: routePath,
				mutationFn: (request: unknown) => fetchData(request, fetchOptions),
				...queryOptions,
			};
		},
		queryOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			const { request, queryKey, ...tanstackOptions } = queryOptions;
			const disabled = request === skipToken;
			const queryFn = disabled
				? skipToken
				: ({ signal }: { signal?: AbortSignal }) =>
						fetchData(request, {
							...fetchOptions,
							signal,
						});
			return {
				queryKey:
					queryKey ??
					(disabled || request === undefined
						? routePath
						: [...routePath, request]),
				queryFn,
				...tanstackOptions,
			};
		},
		infiniteQueryOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			const { request, queryKey, ...tanstackOptions } = queryOptions;
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
									{
										...fetchOptions,
										signal,
									},
								),
				...tanstackOptions,
			};
		},
		mutationKey: () => routePath,
		queryKey: (request?: unknown) =>
			request === undefined ? routePath : [...routePath, request],
	};
	utils.streamedQueryOptions = (options) => {
		const { fetchOptions, queryOptions } = splitFetchOptions(options);
		const {
			request,
			initialValue,
			reducer,
			refetchMode,
			queryKey,
			...tanstackOptions
		} = queryOptions;
		const streamFn = async ({ signal }: { signal: AbortSignal }) => {
			const data = await fetchData(request, {
				...fetchOptions,
				signal,
			});
			const stream = unwrapResponseBodyForStream
				? (data as { body: unknown }).body
				: data;

			if (!isAsyncIterable(stream)) {
				throw new Error("Route did not return a stream response body");
			}

			return stream;
		};
		const disabled = request === skipToken;
		const queryFn = disabled
			? skipToken
			: typeof reducer === "function"
				? streamedQuery({
						refetchMode,
						initialValue,
						reducer,
						streamFn,
					})
				: streamedQuery({
						refetchMode,
						streamFn,
					});
		return {
			queryKey:
				queryKey ??
				(disabled || request === undefined
					? routePath
					: [...routePath, request]),
			queryFn,
			...tanstackOptions,
		};
	};
	return utils;
};
