import type {
	AnyContractDefinition,
	AnyContractTree,
	ContractRequest,
	ContractResponse,
	GetByPath,
} from "@contract-first-api/core";

type MaybePromise<T> = T | Promise<T>;
type EmptyObject = Record<never, never>;
type Merge<T> = {
	[K in keyof T]: T[K];
};

type ContextValue<TContext> = {
	context: TContext;
};

type HandlerResult<E extends AnyContractDefinition> =
	ContractResponse<E> extends undefined
		? MaybePromise<void>
		: MaybePromise<ContractResponse<E>>;

export type ServiceRequest<
	E extends AnyContractDefinition,
	TContext = EmptyObject,
> =
	ContractRequest<E> extends never
		? ContextValue<TContext>
		: Merge<ContractRequest<E> & ContextValue<TContext>>;

export type ServiceResponse<E extends AnyContractDefinition> =
	ContractResponse<E>;

export type ServiceHandler<
	E extends AnyContractDefinition,
	TContext = EmptyObject,
> = (...args: [request: ServiceRequest<E, TContext>]) => HandlerResult<E>;

export type ServiceTree<
	T extends AnyContractTree,
	TContext = EmptyObject,
> = T extends AnyContractDefinition
	? ServiceHandler<T, TContext>
	: {
			[K in keyof T]: T[K] extends AnyContractTree
				? ServiceTree<T[K], TContext>
				: never;
		};

export type ServiceGroupPaths<T extends AnyContractTree> =
	T extends AnyContractDefinition
		? never
		: {
				[K in keyof T & string]: T[K] extends AnyContractDefinition
					? never
					: T[K] extends AnyContractTree
						? K | `${K}.${ServiceGroupPaths<T[K]>}`
						: never;
			}[keyof T & string];

export type ServiceAtPath<
	T extends AnyContractTree,
	P extends ServiceGroupPaths<T>,
	TContext = EmptyObject,
> = ServiceTree<Extract<GetByPath<T, P>, AnyContractTree>, TContext>;

export type DefineService<T extends AnyContractTree, TContext = EmptyObject> = <
	P extends ServiceGroupPaths<T>,
>(
	path: P,
	service: ServiceAtPath<T, P, TContext>,
) => ServiceAtPath<T, P, TContext>;

export type ServiceTools<T extends AnyContractTree, TContext = EmptyObject> = {
	defineService: DefineService<T, TContext>;
	withContext: <TNextContext>() => ServiceTools<T, TNextContext>;
};

export const defineServiceFor =
	<const T extends AnyContractTree, TContext = EmptyObject>(
		_contracts: T,
	): DefineService<T, TContext> =>
	(_path, service) =>
		service;

const createServiceTools = <
	const T extends AnyContractTree,
	TContext = EmptyObject,
>(
	contracts: T,
): ServiceTools<T, TContext> => ({
	defineService: defineServiceFor<T, TContext>(contracts),
	withContext: <TNextContext>() =>
		createServiceTools<T, TNextContext>(contracts),
});

export function initServices<const T extends AnyContractTree>(
	contracts: T,
): ServiceTools<T, EmptyObject> {
	return createServiceTools<T, EmptyObject>(contracts);
}
