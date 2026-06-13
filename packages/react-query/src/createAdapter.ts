import {
	type ApiClientContractValue,
	type ApiClientError,
	type ApiClientJsonContractValue,
	type ApiClientStreamContractValue,
	type ApiClientTree,
	type ApiClientWebSocketContractValue,
	type ApiResult,
	type FetchArgs,
	type FetchOptions,
	mapApiClientTree,
} from "@contract-first-api/api-client/apiClient";
import type {
	Contract,
	ContractRequest,
	ContractResponse,
	RawRequestContract,
} from "@contract-first-api/core/contracts";
import {
	type QueryClient,
	type QueryKey,
	type QueryObserverResult,
	type Updater,
	type UseMutationOptions,
	type UseMutationResult,
	type UseQueryOptions,
	type UseSuspenseQueryOptions,
	type UseSuspenseQueryResult,
	useMutation,
	useQuery,
	useSuspenseQuery,
} from "@tanstack/react-query";

type MutationVariables<E extends Contract> =
	ContractRequest<E> extends never ? never : ContractRequest<E>;

type QueryOptionsFor<E extends Contract, TData = ContractResponse<E>> = Omit<
	UseQueryOptions<ContractResponse<E>, ApiClientError<E>, TData>,
	"queryKey" | "queryFn"
>;

type SuspenseQueryOptionsFor<
	E extends Contract,
	TData = ContractResponse<E>,
> = Omit<
	UseSuspenseQueryOptions<ContractResponse<E>, ApiClientError<E>, TData>,
	"queryKey" | "queryFn"
>;

type MutationOptionsFor<E extends Contract, TVariables> = Omit<
	UseMutationOptions<ContractResponse<E>, ApiClientError<E>, TVariables>,
	"mutationFn"
>;

type QueryDisabled = false | null | undefined | "" | 0;

type UseQueryArgs<E extends Contract, TData = ContractResponse<E>> =
	ContractRequest<E> extends never
		? [options?: QueryOptionsFor<E, TData>]
		: [
				request: ContractRequest<E> | QueryDisabled,
				options?: QueryOptionsFor<E, TData>,
			];

type UseSuspenseQueryArgs<E extends Contract, TData = ContractResponse<E>> =
	ContractRequest<E> extends never
		? [options?: SuspenseQueryOptionsFor<E, TData>]
		: [
				request: ContractRequest<E>,
				options?: SuspenseQueryOptionsFor<E, TData>,
			];

type UseMutationArgs<E extends Contract> =
	ContractRequest<E> extends never
		? [options?: MutationOptionsFor<E, void>]
		: [
				request: ContractRequest<E>,
				options?: MutationOptionsFor<E, ContractRequest<E>>,
			];

type MutationWrapper<E extends Contract> = Omit<
	UseMutationResult<
		ContractResponse<E>,
		ApiClientError<E>,
		MutationVariables<E>
	>,
	"mutate" | "mutateAsync"
> & {
	mutate: (...args: UseMutationArgs<E>) => void;
	mutateAsync: (...args: UseMutationArgs<E>) => Promise<ContractResponse<E>>;
};

type SetDataArgs<E extends Contract> =
	| [
			request: ContractRequest<E>,
			updater: Updater<
				ContractResponse<E> | undefined,
				ContractResponse<E> | undefined
			>,
	  ]
	| [
			updater: Updater<
				ContractResponse<E> | undefined,
				ContractResponse<E> | undefined
			>,
	  ];

type ReactQueryContractValue<E extends Contract> = {
	$contract: E;
	$fetch: (...args: FetchArgs<E>) => Promise<ContractResponse<E>>;
	$tryFetch: (...args: FetchArgs<E>) => Promise<ApiResult<E>>;
	useMutation: (
		options?: MutationOptionsFor<E, MutationVariables<E>>,
	) => MutationWrapper<E>;
	useQuery: <TData = ContractResponse<E>>(
		...args: UseQueryArgs<E, TData>
	) => QueryObserverResult<TData, ApiClientError<E>>;
	useSuspenseQuery: <TData = ContractResponse<E>>(
		...args: UseSuspenseQueryArgs<E, TData>
	) => UseSuspenseQueryResult<TData, ApiClientError<E>>;
	setData: (...args: SetDataArgs<E>) => void;
	invalidate: (request?: ContractRequest<E>) => Promise<void>;
	clear: (request?: ContractRequest<E>) => void;
	$getKey: (request?: ContractRequest<E>) => QueryKey;
};

type ReactQueryFetchOnlyContractValue<E extends Contract> = {
	$contract: E;
	$fetch: (...args: FetchArgs<E>) => Promise<ContractResponse<E>>;
	$tryFetch: (...args: FetchArgs<E>) => Promise<ApiResult<E>>;
};

type ReactQueryStreamContractValue<E extends Contract> = {
	$contract: E;
	$stream: ApiClientStreamContractValue<E>["stream"];
	$tryStream: ApiClientStreamContractValue<E>["tryStream"];
	$subscribe: ApiClientStreamContractValue<E>["subscribe"];
	$trySubscribe: ApiClientStreamContractValue<E>["trySubscribe"];
};

type ReactQueryWebSocketContractValue<E extends Contract> = {
	$contract: E;
	$connect: ApiClientWebSocketContractValue<E>["connect"];
	$tryConnect: ApiClientWebSocketContractValue<E>["tryConnect"];
};

export type WrapContracts<T> = {
	[K in keyof T]: T[K] extends ApiClientJsonContractValue<infer E>
		? E extends RawRequestContract
			? ReactQueryFetchOnlyContractValue<E>
			: ReactQueryContractValue<E>
		: T[K] extends ApiClientStreamContractValue<infer E>
			? ReactQueryStreamContractValue<E>
			: T[K] extends ApiClientWebSocketContractValue<infer E>
				? ReactQueryWebSocketContractValue<E>
				: T[K] extends Record<string, unknown>
					? WrapContracts<T[K]>
					: never;
};

export default function createAdapter<TApi extends ApiClientTree>(
	api: TApi,
	queryClient: QueryClient,
): WrapContracts<TApi> {
	const wrapNode = (node: ApiClientContractValue, path: string[] = []) => {
		if ("connect" in node) return wrapWebSocketContractNode(node);
		if (!("fetch" in node)) return wrapStreamContractNode(node);
		if (node.$contract.options?.mode === "raw") {
			return wrapFetchOnlyContractNode(node);
		}
		return wrapContractNode(node, path, queryClient);
	};

	return mapApiClientTree(api, wrapNode) as WrapContracts<TApi>;
}

type RequestArgs = unknown[];
type ContractCall = (...args: unknown[]) => Promise<unknown>;

const takesRequestInput = (contract: Contract) =>
	Boolean(contract.request) || contract.options?.mode === "raw";

const readRequestArg = (contract: Contract, args: RequestArgs) =>
	takesRequestInput(contract) ? args[0] : undefined;

const readHookOptionsArg = (contract: Contract, args: RequestArgs) =>
	(takesRequestInput(contract) ? args[1] : args[0] || {}) as Record<
		string,
		unknown
	>;

const readMutationVariablesArg = (contract: Contract, args: RequestArgs) =>
	takesRequestInput(contract) ? args[0] : undefined;

const readMutationHookOptionsArg = (
	contract: Contract,
	args: RequestArgs,
): Record<string, unknown> | undefined =>
	(takesRequestInput(contract) ? args[1] : args[0]) as
		| Record<string, unknown>
		| undefined;

const readFetchOptionsArg = (
	contract: Contract,
	args: RequestArgs,
): FetchOptions | undefined =>
	(takesRequestInput(contract) ? args[1] : args[0]) as
		| FetchOptions
		| undefined;

const callContract = (
	fn: ContractCall,
	contract: Contract,
	args: RequestArgs,
) => {
	const request = readRequestArg(contract, args);
	const fetchOptions = readFetchOptionsArg(contract, args);

	if (!takesRequestInput(contract)) {
		return fn(fetchOptions);
	}

	return fn(request, fetchOptions);
};

const getQueryKey = (request: unknown, path: string[]) =>
	request ? [...path, request] : path;

const wrapStreamContractNode = (node: ApiClientStreamContractValue) => ({
	$contract: node.$contract,
	$stream: node.stream,
	$tryStream: node.tryStream,
	$subscribe: node.subscribe,
	$trySubscribe: node.trySubscribe,
});

const wrapWebSocketContractNode = (node: ApiClientWebSocketContractValue) => ({
	$contract: node.$contract,
	$connect: node.connect,
	$tryConnect: node.tryConnect,
});

const wrapFetchOnlyContractNode = (node: ApiClientJsonContractValue) => {
	const fn = node.fetch as ContractCall;
	const tryFn = node.tryFetch as ContractCall;
	const contract = node.$contract;

	return {
		$contract: contract,
		$fetch: async (...args: RequestArgs) => await callContract(fn, contract, args),
		$tryFetch: async (...args: RequestArgs) =>
			await callContract(tryFn, contract, args),
	};
};

const buildMutation =
	($fetch: (...args: RequestArgs) => Promise<unknown>, contract: Contract) =>
	(options?: object) => {
		const mutation = useMutation({
			mutationFn: (request: unknown) =>
				contract.request ? $fetch(request) : $fetch(),
			...options,
		});

		return {
			...mutation,
			mutate: (...args: RequestArgs) =>
				mutation.mutate(
					readMutationVariablesArg(contract, args),
					readMutationHookOptionsArg(contract, args),
				),
			mutateAsync: (...args: RequestArgs) =>
				mutation.mutateAsync(
					readMutationVariablesArg(contract, args),
					readMutationHookOptionsArg(contract, args),
				),
		};
	};

const wrapContractNode = (
	node: ApiClientJsonContractValue,
	path: string[],
	queryClient: QueryClient,
) => {
	const fn = node.fetch as ContractCall;
	const tryFn = node.tryFetch as ContractCall;
	const contract = node.$contract;

	const $fetch = async (...args: RequestArgs) => {
		return await callContract(fn, contract, args);
	};

	const useMutationHook = buildMutation($fetch, contract);

	const $tryFetch = async (...args: RequestArgs) =>
		await callContract(tryFn, contract, args);

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
		$contract: contract,
		$fetch,
		$tryFetch,
	};

	const mutationProperties = {
		useMutation: useMutationHook,
	};

	const queryProperties = {
		useQuery: (...args: RequestArgs) => {
			const request = readRequestArg(contract, args);
			const options = readHookOptionsArg(contract, args);

			const queryEnabled = !!(contract.request && request) || !contract.request;
			return useQuery({
				queryKey: getQueryKey(request, path),
				queryFn: async ({ signal }) =>
					contract.request
						? await $fetch(request, { signal })
						: await $fetch({ signal }),
				enabled: queryEnabled,
				...options,
			});
		},
		useSuspenseQuery: (...args: RequestArgs) => {
			const request = readRequestArg(contract, args);
			const options = readHookOptionsArg(contract, args);

			return useSuspenseQuery({
				queryKey: getQueryKey(request, path),
				queryFn: ({ signal }) =>
					contract.request ? $fetch(request, { signal }) : $fetch({ signal }),
				...options,
			});
		},
		setData,
		$getKey,
		invalidate,
		clear,
	};

	return {
		...sharedProperties,
		...mutationProperties,
		...queryProperties,
	};
};
