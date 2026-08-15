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
	getKey: (...args: RequestArgs) => QueryKey;
};

const readRequestArg = (route: RouteDeclaration, args: RequestArgs) =>
	takesRequestInput(route) ? args[0] : undefined;

const isSkipToken = (value: unknown): value is typeof skipToken =>
	value === skipToken;

const isDisabledRequest = (value: unknown) => !value || isSkipToken(value);

const readQueryOptionsArg = (route: RouteDeclaration, args: RequestArgs) =>
	(takesRequestInput(route) ? args[1] : args[0] || {}) as Record<
		string,
		unknown
	>;

const stripUndefinedFields = (request: unknown) => {
	if (typeof request !== "object" || request === null) return request;

	return Object.fromEntries(
		Object.entries(request).filter(([, value]) => value !== undefined),
	);
};

const getQueryKey = (route: RouteDeclaration, request: unknown) => {
	const cacheKey = route.cacheKey ?? [];
	const normalizedRequest = stripUndefinedFields(request);

	return normalizedRequest &&
		typeof normalizedRequest === "object" &&
		Object.keys(normalizedRequest).length > 0
		? [...cacheKey, normalizedRequest]
		: cacheKey;
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

export const createRouteApi = (
	route: RouteDeclaration,
	fetchResponse: FetchResponse,
): RouteApi => {
	const getKey = (request?: unknown) => getQueryKey(route, request);

	return {
		mutationOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			return {
				mutationFn: (request: unknown) =>
					fetchQueryData(fetchResponse, route, request, fetchOptions),
				...queryOptions,
			};
		},
		queryOptions: (...args: RequestArgs) => {
			const request = readRequestArg(route, args);
			const { fetchOptions, queryOptions } = splitFetchOptions(
				readQueryOptionsArg(route, args),
			);
			const disabled = takesRequestInput(route) && isDisabledRequest(request);
			const queryFn = disabled
				? skipToken
				: ({ signal }: { signal?: FetchOptions["signal"] }) =>
						fetchQueryData(fetchResponse, route, request, {
							...fetchOptions,
							signal,
						});
			const queryKeyRequest = disabled ? undefined : request;

			return {
				queryKey: getKey(queryKeyRequest),
				queryFn,
				...queryOptions,
			};
		},
		infiniteQueryOptions: (options) => {
			const { fetchOptions, queryOptions } = splitFetchOptions(options);
			return {
				queryFn: ({
					pageParam,
					signal,
				}: {
					pageParam: unknown;
					signal?: FetchOptions["signal"];
				}) =>
					fetchQueryData(fetchResponse, route, pageParam, {
						...fetchOptions,
						signal,
					}),
				...queryOptions,
			} as unknown as InfiniteQueryObserverOptions<unknown, unknown, unknown>;
		},
		getKey: (...args: RequestArgs) => getKey(readRequestArg(route, args)),
	};
};
