import { initClient } from "@contract-first-api/core";
import type {
	ApiClientOptions,
	FetchOptions,
	FetchResponseFn,
	InferRouteClientRequest,
	InferRouteClientRequestInput,
	UndeclaredRouteClientResponse,
} from "@contract-first-api/core/client";
import type {
	Contract,
	InferRouteErrors,
	InferRouteSuccessResponse,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contracts";
import { mapContractRoutes } from "@contract-first-api/core/contracts";
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

export type InferRouteQueryData<E extends RouteDeclaration> =
	InferRouteSuccessResponse<E>;

export type InferRouteQueryError<E extends RouteDeclaration> =
	| InferRouteErrors<E>
	| UndeclaredRouteClientResponse
	| Error;

export type InferRouteMutationVariables<E extends RouteDeclaration> =
	InferRouteClientRequestInput<E>;

type QueryOptionsFor<
	E extends RouteDeclaration,
	TData = InferRouteQueryData<E>,
> = Omit<
	UseQueryOptions<InferRouteQueryData<E>, InferRouteQueryError<E>, TData>,
	"queryKey" | "queryFn"
>;

type SuspenseQueryOptionsFor<
	E extends RouteDeclaration,
	TData = InferRouteQueryData<E>,
> = Omit<
	UseSuspenseQueryOptions<
		InferRouteQueryData<E>,
		InferRouteQueryError<E>,
		TData
	>,
	"queryKey" | "queryFn"
>;

type MutationOptionsFor<E extends RouteDeclaration> = Omit<
	UseMutationOptions<
		InferRouteQueryData<E>,
		InferRouteQueryError<E>,
		InferRouteMutationVariables<E>
	>,
	"mutationFn"
>;

type QueryDisabled = false | null | undefined | "" | 0;

type UseQueryArgs<E extends RouteDeclaration, TData = InferRouteQueryData<E>> =
	InferRouteClientRequest<E> extends never
		? [options?: QueryOptionsFor<E, TData>]
		: [
				request: InferRouteClientRequest<E> | QueryDisabled,
				options?: QueryOptionsFor<E, TData>,
			];

type UseSuspenseQueryArgs<
	E extends RouteDeclaration,
	TData = InferRouteQueryData<E>,
> =
	InferRouteClientRequest<E> extends never
		? [options?: SuspenseQueryOptionsFor<E, TData>]
		: [
				request: InferRouteClientRequest<E>,
				options?: SuspenseQueryOptionsFor<E, TData>,
			];

type SetDataArgs<E extends RouteDeclaration> =
	| [
			request: InferRouteClientRequest<E>,
			updater: Updater<
				InferRouteQueryData<E> | undefined,
				InferRouteQueryData<E> | undefined
			>,
	  ]
	| [
			updater: Updater<
				InferRouteQueryData<E> | undefined,
				InferRouteQueryData<E> | undefined
			>,
	  ];

type ReactQueryRouteValue<E extends RouteDeclaration> = {
	useMutation: (
		options?: MutationOptionsFor<E>,
	) => UseMutationResult<
		InferRouteQueryData<E>,
		InferRouteQueryError<E>,
		InferRouteMutationVariables<E>
	>;
	useQuery: <TData = InferRouteQueryData<E>>(
		...args: UseQueryArgs<E, TData>
	) => QueryObserverResult<TData, InferRouteQueryError<E>>;
	useSuspenseQuery: <TData = InferRouteQueryData<E>>(
		...args: UseSuspenseQueryArgs<E, TData>
	) => UseSuspenseQueryResult<TData, InferRouteQueryError<E>>;
	setData: (...args: SetDataArgs<E>) => void;
	invalidate: (request?: InferRouteClientRequest<E>) => Promise<void>;
	clear: (request?: InferRouteClientRequest<E>) => void;
	getKey: (request?: InferRouteClientRequest<E>) => QueryKey;
};

export type ReactQueryApiFor<T extends Contract> =
	T extends WebSocketRouteDeclaration
		? Record<never, never>
		: T extends RouteDeclaration
			? ReactQueryRouteValue<T>
			: {
					[K in keyof T]: T[K] extends Contract
						? ReactQueryApiFor<T[K]>
						: never;
				};

export type ReactQueryClientOptions = ApiClientOptions & {
	queryClient: QueryClient;
};

export type ReactQueryClient<TContract extends Contract> =
	ReactQueryApiFor<TContract>;

type RequestArgs = unknown[];

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

const isWebSocketRoute = (
	contract: RouteDeclaration,
): contract is WebSocketRouteDeclaration =>
	contract.options?.mode === "websocket";

const takesRequestInput = (contract: RouteDeclaration) =>
	Boolean(contract.request) || contract.options?.mode === "raw";

const readRequestArg = (contract: RouteDeclaration, args: RequestArgs) =>
	takesRequestInput(contract) ? args[0] : undefined;

const readHookOptionsArg = (contract: RouteDeclaration, args: RequestArgs) =>
	(takesRequestInput(contract) ? args[1] : args[0] || {}) as Record<
		string,
		unknown
	>;

const normalizeError = (error: unknown) =>
	error instanceof Error
		? error
		: new Error("API request failed", { cause: error });

const isUndeclaredRouteClientResponse = (
	value: unknown,
): value is UndeclaredRouteClientResponse =>
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

const fetchQueryData = async <E extends RouteDeclaration>(
	fetchResponse: FetchResponseFn<E>,
	contract: E,
	request: unknown,
	options?: FetchOptions,
): Promise<InferRouteQueryData<E>> => {
	try {
		const callFetchResponse = fetchResponse as (
			...args: unknown[]
		) => ReturnType<FetchResponseFn<E>>;
		const response = (
			takesRequestInput(contract)
				? await callFetchResponse(request, options)
				: await callFetchResponse(options)
		) as Awaited<ReturnType<FetchResponseFn<E>>>;

		if (!response.declared) {
			throw response;
		}

		const { declared: _declared, ...declaredResponse } = response;

		if (!isSuccessStatus(declaredResponse.status)) {
			throw declaredResponse;
		}

		return declaredResponse as InferRouteQueryData<E>;
	} catch (error) {
		if (isUndeclaredRouteClientResponse(error) || isDeclaredResponse(error)) {
			throw error;
		}

		throw normalizeError(error);
	}
};

const wrapRouteNode = <E extends RouteDeclaration>(
	contract: E,
	fetchResponse: FetchResponseFn<E>,
	path: string[],
	queryClient: QueryClient,
): ReactQueryRouteValue<E> => {
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

export const initReactQueryClient = <TContract extends Contract>(
	contract: TContract,
	options: ReactQueryClientOptions,
): ReactQueryClient<TContract> => {
	const { queryClient, ...clientOptions } = options;
	const client = initClient(contract, clientOptions);

	return mapContractRoutes(contract, (route, path) => {
		if (isWebSocketRoute(route)) {
			return {};
		}

		const apiNode = getByPath(client, path) as {
			fetchResponse: FetchResponseFn<typeof route>;
		};

		return wrapRouteNode(route, apiNode.fetchResponse, path, queryClient);
	}) as ReactQueryApiFor<TContract>;
};

export default initReactQueryClient;
