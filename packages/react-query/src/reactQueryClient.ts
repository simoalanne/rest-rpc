import { initClient } from "@contract-first-api/core";
import type {
	ApiClientFetchOptions,
	ApiClientOptions,
	FetchResponseFn,
	InferRouteClientRequest,
	InferRouteClientRequestInput,
	UndeclaredRouteClientResponse,
} from "@contract-first-api/core/client";
import type {
	Contract,
	HttpRouteDeclaration,
	InferRouteErrors,
	InferRouteSuccessResponse,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type {
	QueryClient,
	QueryKey,
	QueryObserverResult,
	Updater,
	UseMutationOptions,
	UseMutationResult,
	UseQueryOptions,
	UseSuspenseQueryOptions,
	UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { createRouteHooks } from "./routeHooks.ts";

export type InferRouteQueryData<E extends RouteDeclaration> =
	InferRouteSuccessResponse<E> & {
		headers: Headers;
	};

export type InferRouteQueryError<E extends RouteDeclaration> =
	| (InferRouteErrors<E> & { headers: Headers })
	| UndeclaredRouteClientResponse
	| Error;

export type InferRouteMutationVariables<E extends RouteDeclaration> =
	InferRouteClientRequestInput<E>;

export type ReactQueryFetchOptions = ApiClientFetchOptions;

type WithFetchOptions<T> = T & {
	fetchOptions?: ReactQueryFetchOptions;
};

type QueryOptionsFor<
	E extends RouteDeclaration,
	TData = InferRouteQueryData<E>,
> = WithFetchOptions<
	Omit<
		UseQueryOptions<InferRouteQueryData<E>, InferRouteQueryError<E>, TData>,
		"queryKey" | "queryFn"
	>
>;

type SuspenseQueryOptionsFor<
	E extends RouteDeclaration,
	TData = InferRouteQueryData<E>,
> = WithFetchOptions<
	Omit<
		UseSuspenseQueryOptions<
			InferRouteQueryData<E>,
			InferRouteQueryError<E>,
			TData
		>,
		"queryKey" | "queryFn"
	>
>;

type MutationOptionsFor<E extends RouteDeclaration> = WithFetchOptions<
	Omit<
		UseMutationOptions<
			InferRouteQueryData<E>,
			InferRouteQueryError<E>,
			InferRouteMutationVariables<E>
		>,
		"mutationFn"
	>
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

type ReactQueryTreeFor<T extends Contract> = {
	[K in keyof T as T[K] extends Contract
		? ReactQueryApiFor<T[K]> extends never
			? never
			: keyof ReactQueryApiFor<T[K]> extends never
				? never
				: K
		: never]: T[K] extends Contract ? ReactQueryApiFor<T[K]> : never;
};

export type ReactQueryApiFor<T extends Contract> =
	T extends WebSocketRouteDeclaration
		? never
		: T extends HttpRouteDeclaration
			? ReactQueryRouteValue<T>
			: ReactQueryTreeFor<T>;

export type ReactQueryClientOptions = ApiClientOptions & {
	queryClient: QueryClient;
};

export type ReactQueryClient<TContract extends Contract> =
	ReactQueryApiFor<TContract>;

const isWebSocketRoute = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.options?.mode === "websocket";

const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

const getByPath = (tree: unknown, path: string[]) =>
	path.reduce((node, key) => (node as Record<string, unknown>)[key], tree);

export const initReactQueryClient = <TContract extends Contract>(
	contract: TContract,
	options: ReactQueryClientOptions,
): ReactQueryClient<TContract> => {
	const { queryClient, ...clientOptions } = options;
	const client = initClient(contract, clientOptions);

	const mapHttpRoutes = (node: Contract, path: string[] = []): unknown => {
		if (isRouteDeclaration(node)) {
			if (isWebSocketRoute(node)) return undefined;

			const apiNode = getByPath(client, path) as {
				fetchResponse: FetchResponseFn<typeof node>;
			};

			return createRouteHooks(
				node,
				apiNode.fetchResponse as (...args: unknown[]) => Promise<unknown>,
				path,
				queryClient,
			);
		}

		const entries = Object.entries(node)
			.map(([key, value]) => [key, mapHttpRoutes(value, [...path, key])])
			.filter((entry): entry is [string, unknown] => entry[1] !== undefined);

		if (entries.length === 0 && path.length > 0) {
			return undefined;
		}

		return Object.fromEntries(entries);
	};

	return mapHttpRoutes(contract) as ReactQueryApiFor<TContract>;
};

export default initReactQueryClient;
