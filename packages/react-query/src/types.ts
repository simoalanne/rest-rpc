import type {
	ApiClientError,
	ApiClientJsonContractValue,
	ApiClientStreamContractValue,
	ApiResult,
	FetchArgs,
} from "@contract-first-api/api-client";
import type {
	Contract,
	ContractRequest,
	ContractResponse,
} from "@contract-first-api/core";
import type {
	QueryKey,
	QueryObserverResult,
	Updater,
	UseMutationOptions,
	UseMutationResult,
	UseQueryOptions,
	UseSuspenseQueryOptions,
	UseSuspenseQueryResult,
} from "@tanstack/react-query";

export type MutationVariables<E extends Contract> =
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

export type UseQueryArgs<E extends Contract, TData = ContractResponse<E>> =
	ContractRequest<E> extends never
		? [options?: QueryOptionsFor<E, TData>]
		: [
				request: ContractRequest<E> | QueryDisabled,
				options?: QueryOptionsFor<E, TData>,
			];

export type UseSuspenseQueryArgs<
	E extends Contract,
	TData = ContractResponse<E>,
> =
	ContractRequest<E> extends never
		? [options?: SuspenseQueryOptionsFor<E, TData>]
		: [
				request: ContractRequest<E> | QueryDisabled,
				options?: SuspenseQueryOptionsFor<E, TData>,
			];

export type UseMutationArgs<E extends Contract> =
	ContractRequest<E> extends never
		? [options?: MutationOptionsFor<E, void>]
		: [
				request: ContractRequest<E>,
				options?: MutationOptionsFor<E, ContractRequest<E>>,
			];

export type MutationWrapper<E extends Contract> = Omit<
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

type SharedFunctions<E extends Contract> = {
	$fetch: (...args: FetchArgs<E>) => Promise<ContractResponse<E>>;
	$tryFetch: (...args: FetchArgs<E>) => Promise<ApiResult<E>>;
};

type SharedProperties<E extends Contract> = {
	$contract: E;
} & SharedFunctions<E>;

export type AllFunctions<E extends Contract> = QueryFunctions<E> &
	MutationFunctions<E>;

export type MutationFunctions<E extends Contract> = {
	useMutation: (
		options?: MutationOptionsFor<E, MutationVariables<E>>,
	) => MutationWrapper<E>;
} & SharedProperties<E>;

export type QueryFunctions<E extends Contract> = {
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
} & SharedProperties<E>;

export type QueryWrapper<E extends Contract> = AllFunctions<E> & {
	$reactQueryApi: AllFunctions<E>;
};

export type WrapContracts<T> = {
	[K in keyof T]: T[K] extends ApiClientJsonContractValue<infer E>
		? QueryWrapper<E>
		: T[K] extends ApiClientStreamContractValue
			? T[K]
			: T[K] extends Record<string, unknown>
				? WrapContracts<T[K]>
				: never;
};
