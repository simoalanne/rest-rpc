import type z from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type RequestSchema = {
	body?: z.ZodObject;
	query?: z.ZodObject;
	params?: z.ZodObject;
};

export type ResponseSchema = z.ZodType;

export type Contract<TMeta = unknown> = {
	path: string;
	method: HttpMethod;
	request?: RequestSchema;
	response?: ResponseSchema;
	meta?: TMeta;
};

export type ContractTree<TMeta = unknown> =
	| Contract<TMeta>
	| { [k: string]: ContractTree<TMeta> };

export type AnyContractDefinition<TMeta = unknown> = Contract<TMeta>;
export type AnyContractTree<TMeta = unknown> = ContractTree<TMeta>;

export type ContractResponse<E extends AnyContractDefinition> = E extends {
	response: infer R;
}
	? z.infer<R>
	: undefined;

type InferRequest<R> = {
	[K in keyof R]: R[K] extends z.ZodObject ? z.infer<R[K]> : never;
};

type RawRequest<E extends AnyContractDefinition> = E extends {
	request: infer R;
}
	? InferRequest<R>
	: never;

type Merge<T> = {
	[K in keyof T]: T[K];
};

type UnionToIntersection<T> = (
	T extends unknown
		? (value: T) => void
		: never
) extends (value: infer R) => void
	? R
	: never;

export type ContractRequest<E extends AnyContractDefinition> =
	RawRequest<E> extends infer R
		? R extends { body?: infer B; query?: infer Q; params?: infer P }
			? Merge<B & Q & P>
			: R
		: never;

export type GetByPath<
	T,
	P extends string,
> = P extends `${infer Head}.${infer Tail}`
	? Head extends keyof T
		? GetByPath<T[Head], Tail>
		: never
	: P extends keyof T
		? T[P]
		: never;

type ContractAtPath<T extends AnyContractTree, P extends DotPaths<T>> = Extract<
	GetByPath<T, P>,
	AnyContractDefinition
>;

export type DotPaths<T> = T extends AnyContractDefinition
	? never
	: {
			[K in Extract<keyof T, string>]: T[K] extends AnyContractDefinition
				? K
				: T[K] extends AnyContractTree
					? `${K}.${DotPaths<T[K]>}`
					: never;
		}[Extract<keyof T, string>];

export type ContractApiRequest<
	T extends AnyContractTree,
	P extends DotPaths<T>,
> = ContractRequest<ContractAtPath<T, P>>;

export type ContractApiResponse<
	T extends AnyContractTree,
	P extends DotPaths<T>,
> = ContractResponse<ContractAtPath<T, P>>;

type ContractTools<TMeta> = {
	defineContract: <const TContract extends AnyContractTree<TMeta>>(
		contract: TContract,
	) => TContract;
	mergeContracts: <const TContracts extends AnyContractTree<TMeta>[]>(
		...contracts: TContracts
	) => Merge<UnionToIntersection<TContracts[number]>>;
};

export const initContracts = <TMeta = unknown>(): ContractTools<TMeta> => ({
	defineContract: (contract) => contract,
	mergeContracts: (...contracts) => Object.assign({}, ...contracts),
});
