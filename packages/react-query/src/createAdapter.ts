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
import type { WrapContracts } from "./types.ts";

export default function createAdapter<TApi extends ApiClientTree>(
	api: TApi,
	queryClient: QueryClient,
): WrapContracts<TApi> {
	const wrapNode = (node: ApiClientContractValue, path: string[] = []) =>
		wrapContractNode(node, path, queryClient);

	return mapApiClientTree(api, wrapNode) as WrapContracts<TApi>;
}

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
	($fetch: (...args: RequestArgs) => Promise<unknown>, ctx: Contract) =>
	(options?: object) => {
		const mutation = useMutation({
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
	queryClient: QueryClient,
) => {
	const fn = node.fetch as ContractCall;
	const { ctx } = node;

	const $fetch = async (...args: RequestArgs) => {
		return await callContract(fn, ctx, args);
	};

	const useMutationHook = buildMutation($fetch, ctx);

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
		queryClient.invalidateQueries({
			queryKey: getQueryKey(request, path),
		});

	const clear = (request?: unknown) => {
		queryClient.cancelQueries({ queryKey: getQueryKey(request, path) });
		queryClient.removeQueries({ queryKey: getQueryKey(request, path) });
	};

	const setData = (...args: unknown[]) => {
		if (args.length === 2) {
			const [request, updater] = args;
			queryClient.setQueryData($getKey(request), updater);
			return;
		}
		const [updater] = args;
		queryClient.setQueriesData({ queryKey: path }, updater);
	};

	const sharedProperties = {
		$contract: ctx,
		$fetch,
		$tryFetch,
	};

	const mutationProperties = {
		useMutation: useMutationHook,
	};

	const queryProperties = {
		useQuery: (...args: RequestArgs) => {
			const request = readRequestArg(ctx, args);
			const options = readHookOptionsArg(ctx, args);

			const queryEnabled = !!(ctx.request && request) || !ctx.request;
			return useQuery({
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

			return useSuspenseQuery({
				queryKey: getQueryKey(request, path),
				queryFn: ({ signal }) =>
					ctx.request ? $fetch(request, { signal }) : $fetch({ signal }),
				...options,
			});
		},
		setData,
		$getKey,
		invalidate,
		clear,
	};

	const $reactQueryApi = {
		...sharedProperties,
		...mutationProperties,
		...queryProperties,
	};

	if (ctx.method !== "GET") {
		return {
			...sharedProperties,
			...mutationProperties,
			$reactQueryApi,
		};
	}

	return {
		...sharedProperties,
		...queryProperties,
		$reactQueryApi,
	};
};
