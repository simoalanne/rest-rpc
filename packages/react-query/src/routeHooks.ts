import type {
	ApiClientFetchOptions,
	FetchOptions,
} from "@rest-rpc/core/client";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	type QueryClient,
	type QueryKey,
	useMutation,
	useQuery,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	type FetchResponse,
	fetchQueryData,
	takesRequestInput,
} from "./queryData.ts";

type RequestArgs = unknown[];
type OptionsWithFetchOptions = Record<string, unknown> & {
	fetchOptions?: ApiClientFetchOptions;
};
type CacheHelperOptions = {
	queryKey?: QueryKey;
};

export type RouteHooks = {
	useMutation: (options?: Record<string, unknown>) => unknown;
	useQuery: (...args: RequestArgs) => unknown;
	useSuspenseQuery: (...args: RequestArgs) => unknown;
	setData: (...args: RequestArgs) => void;
	invalidate: (...args: RequestArgs) => Promise<void>;
	clear: (...args: RequestArgs) => void;
	getKey: (...args: RequestArgs) => QueryKey;
};

const readRequestArg = (route: RouteDeclaration, args: RequestArgs) =>
	takesRequestInput(route) ? args[0] : undefined;

const readHookOptionsArg = (route: RouteDeclaration, args: RequestArgs) =>
	(takesRequestInput(route) ? args[1] : args[0] || {}) as Record<
		string,
		unknown
	>;

const readCacheHelperOptionsArg = (
	route: RouteDeclaration,
	args: RequestArgs,
) =>
	(takesRequestInput(route) ? args[1] : args[0]) as
		| CacheHelperOptions
		| undefined;

const omitUndefinedFields = (request: unknown) => {
	if (typeof request !== "object" || request === null) return request;

	return Object.fromEntries(
		Object.entries(request).filter(([, value]) => value !== undefined),
	);
};

export const getQueryKey = (request: unknown, path: string[]) =>
	request ? [...path, omitUndefinedFields(request)] : path;

const splitFetchOptions = <
	TOptions extends Record<string, unknown> | undefined,
>(
	options: TOptions,
) => {
	const { fetchOptions, ...reactQueryOptions } = (options ??
		{}) as OptionsWithFetchOptions;
	return {
		fetchOptions,
		reactQueryOptions,
	};
};

export const createRouteHooks = (
	route: RouteDeclaration,
	fetchResponse: FetchResponse,
	path: string[],
	queryClient: QueryClient,
): RouteHooks => {
	const getKey = (request?: unknown, options?: CacheHelperOptions) =>
		options?.queryKey ?? getQueryKey(request, path);

	return {
		useMutation: (options) => {
			const { fetchOptions, reactQueryOptions } = splitFetchOptions(options);
			return useMutation({
				mutationFn: (request: unknown) =>
					fetchQueryData(fetchResponse, route, request, fetchOptions),
				...reactQueryOptions,
			});
		},
		useQuery: (...args: RequestArgs) => {
			const request = readRequestArg(route, args);
			const { fetchOptions, reactQueryOptions } = splitFetchOptions(
				readHookOptionsArg(route, args),
			);
			const enabled = takesRequestInput(route) ? Boolean(request) : true;

			return useQuery({
				queryKey: getKey(request),
				queryFn: ({ signal }: { signal?: FetchOptions["signal"] }) =>
					fetchQueryData(fetchResponse, route, request, {
						...fetchOptions,
						signal,
					}),
				enabled,
				...reactQueryOptions,
			});
		},
		useSuspenseQuery: (...args: RequestArgs) => {
			const request = readRequestArg(route, args);
			const { fetchOptions, reactQueryOptions } = splitFetchOptions(
				readHookOptionsArg(route, args),
			);

			return useSuspenseQuery({
				queryKey: getKey(request),
				queryFn: ({ signal }: { signal?: FetchOptions["signal"] }) =>
					fetchQueryData(fetchResponse, route, request, {
						...fetchOptions,
						signal,
					}),
				...reactQueryOptions,
			});
		},
		setData: (...args: RequestArgs) => {
			if (takesRequestInput(route) && args.length >= 2) {
				const [request, updater, options] = args;
				queryClient.setQueryData(
					getKey(request, options as CacheHelperOptions | undefined),
					updater,
				);
				return;
			}

			const [updater, options] = args;
			const queryKey = (options as CacheHelperOptions | undefined)?.queryKey;
			if (queryKey !== undefined) {
				queryClient.setQueryData(queryKey, updater);
				return;
			}

			queryClient.setQueriesData({ queryKey: path }, updater);
		},
		invalidate: (...args: RequestArgs) =>
			queryClient.invalidateQueries({
				queryKey: getKey(
					readRequestArg(route, args),
					readCacheHelperOptionsArg(route, args),
				),
			}),
		clear: (...args: RequestArgs) => {
			const queryKey = getKey(
				readRequestArg(route, args),
				readCacheHelperOptionsArg(route, args),
			);
			queryClient.cancelQueries({ queryKey });
			queryClient.removeQueries({ queryKey });
		},
		getKey: (...args: RequestArgs) =>
			getKey(
				readRequestArg(route, args),
				readCacheHelperOptionsArg(route, args),
			),
	};
};
