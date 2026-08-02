import type {
	ApiClientOptions,
	ClientRequest,
	FetchOptions,
	FetchResponseFn,
	RequestInput,
	UndeclaredClientResponse,
} from "@contract-first-api/core/client";
import { initClient } from "@contract-first-api/core";
import type {
	Contract,
	ContractNonSuccessfulResponse,
	ContractSuccessfulResponse,
	ContractTree,
	WebSocketContract,
} from "@contract-first-api/core/contracts";
import { mapContractTree } from "@contract-first-api/core/contracts";
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

type QueryData<E extends Contract> = ContractSuccessfulResponse<E>;

export type ReactQueryApiError<E extends Contract> =
	| ContractNonSuccessfulResponse<E>
	| UndeclaredClientResponse
	| Error;

type QueryOptionsFor<E extends Contract, TData = QueryData<E>> = Omit<
	UseQueryOptions<QueryData<E>, ReactQueryApiError<E>, TData>,
	"queryKey" | "queryFn"
>;

type SuspenseQueryOptionsFor<
	E extends Contract,
	TData = QueryData<E>,
> = Omit<
	UseSuspenseQueryOptions<QueryData<E>, ReactQueryApiError<E>, TData>,
	"queryKey" | "queryFn"
>;

type MutationOptionsFor<E extends Contract> = Omit<
	UseMutationOptions<QueryData<E>, ReactQueryApiError<E>, RequestInput<E>>,
	"mutationFn"
>;

type QueryDisabled = false | null | undefined | "" | 0;

type UseQueryArgs<E extends Contract, TData = QueryData<E>> =
	ClientRequest<E> extends never
		? [options?: QueryOptionsFor<E, TData>]
		: [
				request: ClientRequest<E> | QueryDisabled,
				options?: QueryOptionsFor<E, TData>,
			];

type UseSuspenseQueryArgs<E extends Contract, TData = QueryData<E>> =
	ClientRequest<E> extends never
		? [options?: SuspenseQueryOptionsFor<E, TData>]
		: [request: ClientRequest<E>, options?: SuspenseQueryOptionsFor<E, TData>];

type SetDataArgs<E extends Contract> =
	| [
			request: ClientRequest<E>,
			updater: Updater<QueryData<E> | undefined, QueryData<E> | undefined>,
	  ]
	| [updater: Updater<QueryData<E> | undefined, QueryData<E> | undefined>];

type ReactQueryContractValue<E extends Contract> = {
	useMutation: (
		options?: MutationOptionsFor<E>,
	) => UseMutationResult<QueryData<E>, ReactQueryApiError<E>, RequestInput<E>>;
	useQuery: <TData = QueryData<E>>(
		...args: UseQueryArgs<E, TData>
	) => QueryObserverResult<TData, ReactQueryApiError<E>>;
	useSuspenseQuery: <TData = QueryData<E>>(
		...args: UseSuspenseQueryArgs<E, TData>
	) => UseSuspenseQueryResult<TData, ReactQueryApiError<E>>;
	setData: (...args: SetDataArgs<E>) => void;
	invalidate: (request?: ClientRequest<E>) => Promise<void>;
	clear: (request?: ClientRequest<E>) => void;
	getKey: (request?: ClientRequest<E>) => QueryKey;
};

export type ReactQueryApiTree<T extends ContractTree> = T extends WebSocketContract
	? Record<never, never>
	: T extends Contract
		? ReactQueryContractValue<T>
		: {
				[K in keyof T]: T[K] extends ContractTree
					? ReactQueryApiTree<T[K]>
					: never;
			};

export type ReactQueryClientOptions = ApiClientOptions & {
	queryClient: QueryClient;
};

export type ReactQueryClient<TContracts extends ContractTree> =
	ReactQueryApiTree<TContracts>;

type RequestArgs = unknown[];

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

const isWebSocketContract = (contract: Contract): contract is WebSocketContract =>
	contract.options?.mode === "websocket";

const takesRequestInput = (contract: Contract) =>
	Boolean(contract.request) || contract.options?.mode === "raw";

const readRequestArg = (contract: Contract, args: RequestArgs) =>
	takesRequestInput(contract) ? args[0] : undefined;

const readHookOptionsArg = (contract: Contract, args: RequestArgs) =>
	(takesRequestInput(contract) ? args[1] : args[0] || {}) as Record<
		string,
		unknown
	>;

const normalizeError = (error: unknown) =>
	error instanceof Error
		? error
		: new Error("API request failed", { cause: error });

const isUndeclaredClientResponse = (
	value: unknown,
): value is UndeclaredClientResponse =>
	typeof value === "object" &&
	value !== null &&
	"declared" in value &&
	value.declared === false;

const isDeclaredResponse = (
	value: unknown,
): value is { status: number; body: unknown } =>
	typeof value === "object" &&
	value !== null &&
	"status" in value &&
	typeof value.status === "number" &&
	"body" in value;

const getQueryKey = (request: unknown, path: string[]) =>
	request ? [...path, request] : path;

const getByPath = (tree: unknown, path: string[]) =>
	path.reduce((node, key) => (node as Record<string, unknown>)[key], tree);

const fetchQueryData = async <E extends Contract>(
	fetchResponse: FetchResponseFn<E>,
	contract: E,
	request: unknown,
	options?: FetchOptions,
): Promise<QueryData<E>> => {
	try {
		const callFetchResponse = fetchResponse as (
			...args: unknown[]
		) => ReturnType<FetchResponseFn<E>>;
		const response = (takesRequestInput(contract)
			? await callFetchResponse(request, options)
			: await callFetchResponse(options)) as Awaited<
			ReturnType<FetchResponseFn<E>>
		>;

		if (!response.declared) {
			throw response;
		}

		const { declared: _declared, ...declaredResponse } = response;

		if (!isSuccessStatus(declaredResponse.status)) {
			throw declaredResponse;
		}

		return declaredResponse as QueryData<E>;
	} catch (error) {
		if (isUndeclaredClientResponse(error) || isDeclaredResponse(error)) {
			throw error;
		}

		throw normalizeError(error);
	}
};

const wrapContractNode = <E extends Contract>(
	contract: E,
	fetchResponse: FetchResponseFn<E>,
	path: string[],
	queryClient: QueryClient,
): ReactQueryContractValue<E> => {
	const getKey = (request?: unknown) => getQueryKey(request, path);

	return {
		useMutation: (options) =>
			useMutation({
				mutationFn: (request) =>
					fetchQueryData(fetchResponse, contract, request, undefined),
				...options,
			}),
		useQuery: (...args: RequestArgs) => {
			const request = readRequestArg(contract, args);
			const options = readHookOptionsArg(contract, args);
			const enabled = takesRequestInput(contract) ? Boolean(request) : true;

			return useQuery({
				queryKey: getKey(request),
				queryFn: ({ signal }) =>
					fetchQueryData(fetchResponse, contract, request, { signal }),
				enabled,
				...options,
			});
		},
		useSuspenseQuery: (...args: RequestArgs) => {
			const request = readRequestArg(contract, args);
			const options = readHookOptionsArg(contract, args);

			return useSuspenseQuery({
				queryKey: getKey(request),
				queryFn: ({ signal }) =>
					fetchQueryData(fetchResponse, contract, request, { signal }),
				...options,
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

export const initReactQueryClient = <TContracts extends ContractTree>(
	contracts: TContracts,
	options: ReactQueryClientOptions,
): ReactQueryClient<TContracts> => {
	const { queryClient, ...clientOptions } = options;
	const client = initClient(contracts, clientOptions);

	return mapContractTree(contracts, (contract, path) => {
		if (isWebSocketContract(contract)) {
			return {};
		}

		const apiNode = getByPath(client, path) as {
			fetchResponse: FetchResponseFn<typeof contract>;
		};

		return wrapContractNode(contract, apiNode.fetchResponse, path, queryClient);
	}) as ReactQueryApiTree<TContracts>;
};

export default initReactQueryClient;
