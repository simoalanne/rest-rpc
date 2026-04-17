import {
	type ApiClientContractValue,
	type ApiClientTree,
	type FetchOptions,
	mapApiClientTree,
} from "@contract-first-api/api-client";
import type { Contract } from "@contract-first-api/core";
import {
	type QueryClient,
	useMutation,
	useQuery,
	useSuspenseQuery,
} from "@tanstack/react-query";
import type { WrapEndpoints } from "./types.ts";

type ReactQueryRuntime = {
	queryClient: QueryClient;
	useMutation: typeof useMutation;
	useQuery: typeof useQuery;
	useSuspenseQuery: typeof useSuspenseQuery;
};

export default function createAdapter<TApi extends ApiClientTree>(
	api: TApi,
	queryClient: QueryClient,
): WrapEndpoints<TApi> {
	return createAdapterWithRuntime(api, {
		queryClient,
		useMutation,
		useQuery,
		useSuspenseQuery,
	});
}

export const createAdapterWithRuntime = <TApi extends ApiClientTree>(
	api: TApi,
	adapter: ReactQueryRuntime,
): WrapEndpoints<TApi> => {
	const wrapNode = (node: ApiClientContractValue, path: string[] = []) =>
		wrapContractNode(node, path, adapter);

	return mapApiClientTree(api, wrapNode) as WrapEndpoints<TApi>;
};

type RequestArgs = unknown[];
type ContractCall = (...args: unknown[]) => Promise<unknown>;

const readRequestArg = (ctx: Contract, args: RequestArgs) =>
	ctx.request && args[0];

const readHookOptionsArg = (ctx: Contract, args: RequestArgs) =>
	(ctx.request ? args[1] : args[0] || {}) as Record<string, unknown>;

const readMutationVariablesArg = (ctx: Contract, args: RequestArgs) =>
	ctx.request ? args[0] : undefined;

const readMutationHookOptionsArg = (
	ctx: Contract,
	args: RequestArgs,
): Record<string, unknown> | undefined =>
	(ctx.request ? args[1] : args[0]) as Record<string, unknown> | undefined;

const readFetchOptionsArg = (
	ctx: Contract,
	args: RequestArgs,
): FetchOptions | undefined =>
	(ctx.request ? args[1] : args[0]) as FetchOptions | undefined;

const callContract = (fn: ContractCall, ctx: Contract, args: RequestArgs) => {
	const request = readRequestArg(ctx, args);
	const fetchOptions = readFetchOptionsArg(ctx, args);

	if (!ctx.request) {
		return fn(fetchOptions);
	}

	return fn(request, fetchOptions);
};

const getQueryKey = (request: unknown, path: string[]) =>
	request ? [...path, request] : path;

const buildMutation =
	(
		$fetch: (...args: RequestArgs) => Promise<unknown>,
		ctx: Contract,
		adapter: ReactQueryRuntime,
	) =>
	(options?: object) => {
		const mutation = adapter.useMutation({
			mutationFn: (request: unknown) =>
				ctx.request ? $fetch(request) : $fetch(),
			...options,
		});

		return {
			...mutation,
			mutate: (...args: RequestArgs) =>
				mutation.mutate(
					readMutationVariablesArg(ctx, args),
					readMutationHookOptionsArg(ctx, args),
				),
			mutateAsync: (...args: RequestArgs) =>
				mutation.mutateAsync(
					readMutationVariablesArg(ctx, args),
					readMutationHookOptionsArg(ctx, args),
				),
		};
	};

const wrapContractNode = (
	node: ApiClientContractValue,
	path: string[],
	adapter: ReactQueryRuntime,
) => {
	const fn = node.fetch as ContractCall;
	const { ctx } = node;

	const $fetch = async (...args: RequestArgs) => {
		return await callContract(fn, ctx, args);
	};

	const useMutation = buildMutation($fetch, ctx, adapter);

	const $tryFetch = async (...args: RequestArgs) => {
		try {
			const data = await $fetch(...args);
			return { success: true, data };
		} catch (error) {
			return { success: false, error };
		}
	};

	const $getKey = (request?: unknown) => getQueryKey(request, path);

	const invalidate = (request?: unknown) =>
		adapter.queryClient.invalidateQueries({
			queryKey: getQueryKey(request, path),
		});

	const clear = (request?: unknown) => {
		adapter.queryClient.cancelQueries({ queryKey: getQueryKey(request, path) });
		adapter.queryClient.removeQueries({ queryKey: getQueryKey(request, path) });
	};

	const setData = (...args: unknown[]) => {
		if (args.length === 2) {
			const [request, updater] = args;
			adapter.queryClient.setQueryData($getKey(request), updater);
			return;
		}
		const [updater] = args;
		adapter.queryClient.setQueriesData({ queryKey: path }, updater);
	};

	if (ctx.method !== "GET") {
		return {
			useMutation,
			$fetch,
			$tryFetch,
		};
	}

	return {
		useQuery: (...args: RequestArgs) => {
			const request = readRequestArg(ctx, args);
			const options = readHookOptionsArg(ctx, args);

			const queryEnabled = !!(ctx.request && request) || !ctx.request;
			return adapter.useQuery({
				queryKey: getQueryKey(request, path),
				queryFn: async ({ signal }) =>
					ctx.request
						? await $fetch(request, { signal })
						: await $fetch({ signal }),
				enabled: queryEnabled,
				...options,
			});
		},
		useSuspenseQuery: (...args: RequestArgs) => {
			const request = readRequestArg(ctx, args);
			const options = readHookOptionsArg(ctx, args);

			return adapter.useSuspenseQuery({
				queryKey: getQueryKey(request, path),
				queryFn: ({ signal }) =>
					ctx.request ? $fetch(request, { signal }) : $fetch({ signal }),
				...options,
			});
		},
		setData,
		$fetch,
		$tryFetch,
		$getKey,
		invalidate,
		clear,
	};
};
