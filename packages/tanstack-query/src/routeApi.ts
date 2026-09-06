import type {
	ApiClientFetchOptions,
	FetchOptions,
} from "@rest-rpc/core/client";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	type InfiniteQueryObserverOptions,
	type MutationOptions,
	type QueryKey,
	type QueryObserverOptions,
	experimental_streamedQuery as streamedQuery,
	skipToken,
} from "@tanstack/query-core";
import {
	type FetchResponse,
	fetchQueryData,
	takesRequestInput,
} from "./queryData.ts";

type RequestArgs = unknown[];
type OptionsWithFetchOptions = Record<string, unknown> & {
	fetchOptions?: ApiClientFetchOptions;
};

type RouteApiMode = "contract" | "serverFirst";

export type RouteApi = {
	mutationOptions: (
		options?: Record<string, unknown>,
	) => MutationOptions<unknown, unknown, unknown>;
	infiniteQueryOptions: (
		options: Record<string, unknown>,
	) => InfiniteQueryObserverOptions<unknown, unknown, unknown>;
	queryOptions: (
		...args: RequestArgs
	) => QueryObserverOptions<unknown, unknown, unknown>;
	streamedQueryOptions: (
		...args: RequestArgs
	) => QueryObserverOptions<unknown, unknown, unknown>;
	getKey: (...args: RequestArgs) => QueryKey;
};

const isServerFirstRequestInput = (value: unknown) =>
	typeof value === "object" &&
	value !== null &&
	["body", "query", "params", "headers"].some((key) => key in value);

const isSkipToken = (value: unknown): value is typeof skipToken =>
	value === skipToken;

const readsRequestArg = (
	route: RouteDeclaration,
	args: RequestArgs,
	mode: RouteApiMode,
) =>
	mode === "serverFirst"
		? args.length > 1 ||
			isServerFirstRequestInput(args[0]) ||
			(args.length > 0 && (!args[0] || isSkipToken(args[0])))
		: takesRequestInput(route);

const readRequestArg = (
	route: RouteDeclaration,
	args: RequestArgs,
	mode: RouteApiMode,
) => (readsRequestArg(route, args, mode) ? args[0] : undefined);

const isDisabledRequest = (value: unknown) => !value || isSkipToken(value);

const readQueryOptionsArg = (
	route: RouteDeclaration,
	args: RequestArgs,
	mode: RouteApiMode,
) =>
	(readsRequestArg(route, args, mode) ? args[1] : args[0] || {}) as Record<
		string,
		unknown
	>;

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

export const createRouteApi = (
	route: RouteDeclaration,
	routePath: string[],
	fetchResponse: FetchResponse,
	mode: RouteApiMode = "contract",
): RouteApi => {
	const getKey = (request?: unknown) => getQueryKey(request, routePath);

	return {
		mutationOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			return {
				mutationFn: (request: unknown) =>
					fetchQueryData(
						fetchResponse,
						route,
						request,
						fetchOptions,
						mode === "serverFirst" || takesRequestInput(route),
					),
				...queryOptions,
			};
		},
		queryOptions: (...args: RequestArgs) => {
			const hasRequest = readsRequestArg(route, args, mode);
			const request = readRequestArg(route, args, mode);
			const { fetchOptions, queryOptions } = splitFetchOptions(
				readQueryOptionsArg(route, args, mode),
			);
			const disabled = hasRequest && isDisabledRequest(request);
			const queryFn = disabled
				? skipToken
				: ({ signal }: { signal?: FetchOptions["signal"] }) =>
						fetchQueryData(
							fetchResponse,
							route,
							request,
							{
								...fetchOptions,
								signal,
							},
							hasRequest,
						);
			const queryKeyRequest = disabled ? undefined : request;

			return {
				queryKey: getKey(queryKeyRequest),
				queryFn,
				...queryOptions,
			};
		},
		streamedQueryOptions: (...args: RequestArgs) => {
			const hasRequest = readsRequestArg(route, args, mode);
			const request = readRequestArg(route, args, mode);
			const { fetchOptions, queryOptions } = splitFetchOptions(
				readQueryOptionsArg(route, args, mode),
			);
			const { initialValue, reducer, refetchMode, ...tanstackOptions } =
				queryOptions;
			const streamFn = async ({ signal }: { signal: AbortSignal }) => {
				const response = (await fetchQueryData(
					fetchResponse,
					route,
					request,
					{
						...fetchOptions,
						signal,
					},
					hasRequest,
				)) as { body: unknown };

				if (!isAsyncIterable(response.body)) {
					throw new Error("Route did not return a stream response body");
				}

				return response.body;
			};
			const disabled = hasRequest && isDisabledRequest(request);
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
				}) =>
					fetchQueryData(
						fetchResponse,
						route,
						pageParam,
						{
							...fetchOptions,
							signal,
						},
						mode === "serverFirst" || takesRequestInput(route),
					),
				...tanstackOptions,
			} as unknown as InfiniteQueryObserverOptions<unknown, unknown, unknown>;
		},
		getKey: (...args: RequestArgs) => getKey(readRequestArg(route, args, mode)),
	};
};
