import type {
	ApiClientFetchOptions,
	FetchOptions,
} from "@rest-rpc/core/client";
import {
	type InfiniteQueryObserverOptions,
	type MutationOptions,
	type QueryKey,
	type QueryObserverOptions,
	experimental_streamedQuery as streamedQuery,
	skipToken,
} from "@tanstack/query-core";
import { type FetchResponse, fetchQueryData } from "./queryData.ts";

type RequestArgs = unknown[];
type OptionsWithFetchOptions = Record<string, unknown> & {
	fetchOptions?: ApiClientFetchOptions;
};
export type TanstackQueryHelperFunctions = {
	mutationOptions: (
		options?: Record<string, unknown>,
	) => MutationOptions<unknown, unknown, unknown>;
	infiniteQueryOptions: (
		options: Record<string, unknown>,
	) => InfiniteQueryObserverOptions<unknown, unknown, unknown>;
	queryOptions: (
		...args: RequestArgs
	) => QueryObserverOptions<unknown, unknown, unknown>;
	streamedQueryOptions?: (
		...args: RequestArgs
	) => QueryObserverOptions<unknown, unknown, unknown>;
	getKey: (...args: RequestArgs) => QueryKey;
};

type FetchData = (
	request: unknown,
	fetchOptions: FetchOptions | undefined,
) => Promise<unknown>;

const isSkipToken = (value: unknown): value is typeof skipToken =>
	value === skipToken;
const stripUndefinedFields = (request: unknown) => {
	if (typeof request !== "object" || request === null) return request;

	return Object.fromEntries(
		Object.entries(request).filter(([, value]) => value !== undefined),
	);
};

const getQueryKey = (request: unknown, routePath: string[]) => {
	const normalizedRequest = stripUndefinedFields(request);

	return normalizedRequest &&
		typeof normalizedRequest === "object" &&
		Object.keys(normalizedRequest).length > 0
		? [...routePath, normalizedRequest]
		: routePath;
};

const splitFetchOptions = <
	TOptions extends Record<string, unknown> | undefined,
>(
	options: TOptions,
) => {
	const { fetchOptions, ...queryOptions } = (options ??
		{}) as OptionsWithFetchOptions;
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

export const createTanstackHelpersForRoute = (
	routePath: string[],
	dataFetchingFn: FetchData,
	streamResponse?: FetchResponse,
): TanstackQueryHelperFunctions => {
	const getKey = (request?: unknown) => getQueryKey(request, routePath);

	const helpers: TanstackQueryHelperFunctions = {
		mutationOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			return {
				mutationFn: (request: unknown) => dataFetchingFn(request, fetchOptions),
				...queryOptions,
			};
		},
		queryOptions: (...args: RequestArgs) => {
			const request = args[0];
			const { fetchOptions, queryOptions } = splitFetchOptions(
				args[1] as Record<string, unknown> | undefined,
			);
			const disabled = isSkipToken(request);
			const queryFn = disabled
				? skipToken
				: ({ signal }: { signal?: FetchOptions["signal"] }) =>
						dataFetchingFn(request, { ...fetchOptions, signal });
			const queryKeyRequest = disabled ? undefined : request;

			return {
				queryKey: getKey(queryKeyRequest),
				queryFn,
				...queryOptions,
			};
		},
		infiniteQueryOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			const { initialRequest, getNextRequest, queryKey, ...tanstackOptions } =
				queryOptions;
			return {
				queryKey: queryKey ?? getKey(),
				initialPageParam: initialRequest,
				getNextPageParam: getNextRequest,
				queryFn: ({
					pageParam,
					signal,
				}: {
					pageParam: unknown;
					signal?: FetchOptions["signal"];
				}) => dataFetchingFn(pageParam, { ...fetchOptions, signal }),
				...tanstackOptions,
			} as unknown as InfiniteQueryObserverOptions<unknown, unknown, unknown>;
		},
		getKey: (...args: RequestArgs) => getKey(args[0]),
	};
	if (streamResponse) {
		helpers.streamedQueryOptions = (...args: RequestArgs) => {
			const request = args[0];
			const { fetchOptions, queryOptions } = splitFetchOptions(
				args[1] as Record<string, unknown> | undefined,
			);
			const { initialValue, reducer, refetchMode, ...tanstackOptions } =
				queryOptions;
			const streamFn = async ({ signal }: { signal: AbortSignal }) => {
				const response = (await fetchQueryData(streamResponse, request, {
					...fetchOptions,
					signal,
				})) as { body: unknown };

				if (!isAsyncIterable(response.body)) {
					throw new Error("Route did not return a stream response body");
				}

				return response.body;
			};
			const disabled = isSkipToken(request);
			const queryFn = disabled
				? skipToken
				: typeof reducer === "function"
					? streamedQuery({
							refetchMode: refetchMode as "append" | "reset" | "replace",
							initialValue,
							reducer: reducer as (acc: unknown, chunk: unknown) => unknown,
							streamFn,
						})
					: streamedQuery({
							refetchMode: refetchMode as "append" | "reset" | "replace",
							streamFn,
						});
			const queryKeyRequest = disabled ? undefined : request;

			return {
				queryKey: getKey(queryKeyRequest),
				queryFn,
				...tanstackOptions,
			};
		};
	}
	return helpers;
};
