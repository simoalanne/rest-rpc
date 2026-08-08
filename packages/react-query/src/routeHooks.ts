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

export type RouteHooks = {
	useMutation: (options?: Record<string, unknown>) => unknown;
	useQuery: (...args: RequestArgs) => unknown;
	useSuspenseQuery: (...args: RequestArgs) => unknown;
	setData: (...args: RequestArgs) => void;
	invalidate: (request?: unknown) => Promise<void>;
	clear: (request?: unknown) => void;
	getKey: (request?: unknown) => QueryKey;
};

const readRequestArg = (route: RouteDeclaration, args: RequestArgs) =>
	takesRequestInput(route) ? args[0] : undefined;

const readHookOptionsArg = (route: RouteDeclaration, args: RequestArgs) =>
	(takesRequestInput(route) ? args[1] : args[0] || {}) as Record<
		string,
		unknown
	>;

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
	const getKey = (request?: unknown) => getQueryKey(request, path);

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
			if (args.length === 2) {
				const [request, updater] = args;
				queryClient.setQueryData(getKey(request), updater);
				return;
			}

			const [updater] = args;
			queryClient.setQueriesData({ queryKey: path }, updater);
		},
		invalidate: (request) =>
			queryClient.invalidateQueries({
				queryKey: getKey(request),
			}),
		clear: (request) => {
			queryClient.cancelQueries({ queryKey: getKey(request) });
			queryClient.removeQueries({ queryKey: getKey(request) });
		},
		getKey,
	};
};
