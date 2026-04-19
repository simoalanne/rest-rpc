import type {
	AnyContractDefinition,
	AnyContractTree,
	Contract,
	ContractRequest,
	ContractResponse,
	GetByPath,
} from "@contract-first-api/core";
import type { NextFunction, Request, Response } from "express";

export type MaybePromise<T> = T | Promise<T>;
type EmptyObject = Record<never, never>;
type Merge<T> = {
	[K in keyof T]: T[K];
};

export type RequestWithContract<TMeta = unknown> = Omit<Request, "contract"> & {
	contract: Contract<TMeta>;
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

export type DefineMiddleware<TMeta> = <
	TMiddleware extends (
		req: RequestWithContract<TMeta>,
		res: Response,
		next: NextFunction,
	) => MaybePromise<unknown>,
>(
	middleware: TMiddleware,
) => TMiddleware;

export type ServiceTools<
	T extends AnyContractTree,
	TMeta = unknown,
	TContext = EmptyObject,
> = {
	defineService: DefineService<T, TContext>;
	defineMiddleware: DefineMiddleware<TMeta>;
};

export const initServices = <
	T extends AnyContractTree,
	TMeta = unknown,
	TContext = EmptyObject,
>(): ServiceTools<T, TMeta, TContext> => ({
	defineService: (_path, service) => service,
	defineMiddleware: (middleware) => middleware,
});
