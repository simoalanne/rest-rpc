import type {
	Contract,
	ContractMetaOf,
	ContractRequest,
	ContractResponse,
	ContractTree,
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

type HandlerResult<E extends Contract> =
	ContractResponse<E> extends undefined
		? MaybePromise<void>
		: MaybePromise<ContractResponse<E>>;

export type ServiceRequest<E extends Contract, TContext = EmptyObject> =
	ContractRequest<E> extends never
		? ContextValue<TContext>
		: Merge<ContractRequest<E> & ContextValue<TContext>>;

export type ServiceResponse<E extends Contract> = ContractResponse<E>;

export type ServiceHandler<E extends Contract, TContext = EmptyObject> = (
	...args: [request: ServiceRequest<E, TContext>]
) => HandlerResult<E>;

export type ServiceTree<
	T extends ContractTree,
	TContext = EmptyObject,
> = T extends Contract
	? ServiceHandler<T, TContext>
	: {
			[K in keyof T]: T[K] extends ContractTree
				? ServiceTree<T[K], TContext>
				: never;
		};

export type ServiceGroupPaths<T extends ContractTree> = T extends Contract
	? never
	: {
			[K in keyof T & string]: T[K] extends Contract
				? never
				: T[K] extends ContractTree
					? K | `${K}.${ServiceGroupPaths<T[K]>}`
					: never;
		}[keyof T & string];

export type ServiceAtPath<
	T extends ContractTree,
	P extends ServiceGroupPaths<T>,
	TContext = EmptyObject,
> = ServiceTree<Extract<GetByPath<T, P>, ContractTree>, TContext>;

export type DefineService<T extends ContractTree, TContext = EmptyObject> = <
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
	T extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<T>,
> = {
	defineService: DefineService<T, TContext>;
	defineMiddleware: DefineMiddleware<TMeta>;
};

export const initServices = <
	T extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<T>,
>(): ServiceTools<T, TContext, TMeta> => ({
	defineService: (_path, service) => service,
	defineMiddleware: (middleware) => middleware,
});
