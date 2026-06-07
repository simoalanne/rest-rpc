import type z from "zod";
import { flattenContractTree } from "./utils/contractTransformers.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type RequestBodySchema = z.ZodObject | z.ZodDiscriminatedUnion;

export type RequestSchema = {
	body?: RequestBodySchema;
	query?: z.ZodObject;
	params?: z.ZodObject;
};

export type KnownErrorSchema = z.ZodObject<{
	code: z.ZodLiteral<string>;
	status?: z.ZodLiteral<number>;
}>;
export type KnownErrors = KnownErrorSchema | readonly KnownErrorSchema[];

export type ResponseSchema = z.ZodType;

export type Contract<TMeta = unknown> = {
	path: string;
	method: HttpMethod;
	request?: RequestSchema;
	response?: ResponseSchema;
	errors?: KnownErrors;
	meta?: TMeta;
	$meta?: TMeta;
};

export type ContractTree<TMeta = unknown> =
	| Contract<TMeta>
	| { [k: string]: ContractTree<TMeta> };

export type ContractResponse<E extends Contract> = E extends {
	response: infer R;
}
	? z.infer<R>
	: undefined;

type InferRequest<R> = {
	[K in keyof R]: R[K] extends z.ZodType ? z.infer<R[K]> : never;
};

type RawRequest<E extends Contract> = E extends {
	request: infer R;
}
	? InferRequest<R>
	: never;

type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;

export type ContractMetaOf<T> = T extends { $meta?: infer TMeta }
	? TMeta
	: T extends object
		? {
				[K in keyof T]: ContractMetaOf<T[K]>;
			}[keyof T]
		: unknown;

export type ContractRequest<E extends Contract> =
	RawRequest<E> extends infer R
		? R extends { body?: infer B; query?: infer Q; params?: infer P }
			? Merge<B & Q & P>
			: R
		: never;

export type ContractError<E extends Contract> = E extends {
	errors: infer Errors;
}
	? Errors extends KnownErrorSchema
		? z.infer<Errors>
		: Errors extends readonly KnownErrorSchema[]
			? z.infer<Errors[number]>
			: never
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

type ContractAtPath<T extends ContractTree, P extends DotPaths<T>> = Extract<
	GetByPath<T, P>,
	Contract
>;

export type DotPaths<T> = T extends Contract
	? never
	: {
			[K in Extract<keyof T, string>]: T[K] extends Contract
				? K
				: T[K] extends ContractTree
					? `${K}.${DotPaths<T[K]>}`
					: never;
		}[Extract<keyof T, string>];

export type ContractApiRequest<
	T extends ContractTree,
	P extends DotPaths<T>,
> = ContractRequest<ContractAtPath<T, P>>;

export type ContractApiResponse<
	T extends ContractTree,
	P extends DotPaths<T>,
> = ContractResponse<ContractAtPath<T, P>>;

type WithMetaMarker<T, TMeta> =
	T extends Contract<TMeta>
		? T & { $meta?: TMeta }
		: {
				[K in keyof T]: T[K] extends ContractTree<TMeta>
					? WithMetaMarker<T[K], TMeta>
					: never;
			};

const getRequestSchemaKeys = (
	schema: RequestBodySchema | z.ZodObject | undefined,
) => {
	if (!schema) return [];

	if ("options" in schema) {
		return schema.options.flatMap((option) =>
			Object.keys((option as z.ZodObject).shape),
		);
	}

	return Object.keys(schema.shape);
};

const getRequestSchemaKeySet = (
	schema: RequestBodySchema | z.ZodObject | undefined,
) => new Set(getRequestSchemaKeys(schema));

const validateContractTree = (tree: ContractTree) => {
	for (const contract of flattenContractTree(tree)) {
		if (contract.request) {
			const requestKeySets = [
				getRequestSchemaKeySet(contract.request.body),
				getRequestSchemaKeySet(contract.request.query),
				getRequestSchemaKeySet(contract.request.params),
			];
			const requestKeyCount = requestKeySets.reduce(
				(count, keys) => count + keys.size,
				0,
			);
			const uniqueRequestKeys = new Set(
				requestKeySets.flatMap((keys) => [...keys]),
			);

			if (uniqueRequestKeys.size !== requestKeyCount) {
				throw new Error(
					`Contract at path "${contract.path}" has duplicate request keys across its "body", "query" and "params" definitions.`,
				);
			}
		}

		if (Array.isArray(contract.errors)) {
			const codes = new Set(
				Array.from(contract.errors, (error) => {
					const [code] = error.shape.code.values;
					return code;
				}),
			);

			if (codes.size !== contract.errors.length) {
				throw new Error(
					`Contract at path "${contract.path}" has duplicate error codes in its "errors" definition.`,
				);
			}
		}
	}
};

type ContractTools<TMeta> = {
	defineContractTree: <const TContract extends ContractTree<TMeta>>(
		contract: TContract,
	) => WithMetaMarker<TContract, TMeta>;
};

export const initContracts = <TMeta = unknown>(): ContractTools<TMeta> => ({
	defineContractTree: (contract) => {
		validateContractTree(contract);
		return contract as never;
	},
});
