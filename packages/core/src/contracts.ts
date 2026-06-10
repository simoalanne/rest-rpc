import type z from "zod";

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

export type ContractOptions = {
	mode?: "json" | "stream" | "websocket";
	streamFormat?: "ndjson";
};

export type BaseContract<TMeta = unknown> = {
	path: string;
	method: HttpMethod;
	request?: RequestSchema;
	meta?: TMeta;
	$meta?: TMeta;
};

export type JsonContract<TMeta = unknown> = BaseContract<TMeta> & {
	response?: ResponseSchema;
	successStatusCode?: number;
	errors?: KnownErrors;
	options?: { mode?: "json" };
};

export type StreamContract<TMeta = unknown> = BaseContract<TMeta> & {
	response: ResponseSchema;
	successStatusCode?: number;
	errors?: KnownErrors;
	options: { mode: "stream"; streamFormat?: "ndjson" };
};

export type WebSocketContract<TMeta = unknown> = BaseContract<TMeta> & {
	method: "GET";
	options: { mode: "websocket" };
	messages: {
		client: z.ZodType;
		server: z.ZodType;
	};
	errors?: never;
};

export type Contract<TMeta = unknown> =
	| JsonContract<TMeta>
	| StreamContract<TMeta>
	| WebSocketContract<TMeta>;

export type ContractTree<TMeta = unknown> =
	| Contract<TMeta>
	| { [k: string]: ContractTree<TMeta> };

type Tree<T> = Record<string, unknown> | T;

export const mapObjectValues = <TLeaf>(
	tree: Tree<TLeaf>,
	isLeaf: (value: unknown) => value is TLeaf,
	mappingFn: (value: TLeaf, path: string[]) => unknown,
	path: string[] = [],
): unknown =>
	isLeaf(tree)
		? mappingFn(tree, path)
		: Object.entries(tree).reduce(
				(acc, [k, v]) => {
					acc[k] = mapObjectValues(v as Tree<TLeaf>, isLeaf, mappingFn, [
						...path,
						k,
					]);
					return acc;
				},
				{} as Record<string, unknown>,
			);

const isContractDefinition = <TMeta = unknown>(
	value: unknown,
): value is Contract<TMeta> =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

export const mapContractTree = <TMeta = unknown>(
	tree: ContractTree<TMeta>,
	mappingFn: (contract: Contract<TMeta>) => unknown,
) => mapObjectValues(tree, isContractDefinition, mappingFn);

export type FlattenedContract<TMeta = unknown> = Contract<TMeta> & {
	keySegments: string[];
};

export const flattenContractTree = <
	TMeta = unknown,
	TTree extends ContractTree<TMeta> = ContractTree<TMeta>,
>(
	tree: TTree,
): FlattenedContract<TMeta>[] => {
	const result: FlattenedContract<TMeta>[] = [];

	const visit = (node: ContractTree<TMeta>, keySegments: string[]) => {
		if (isContractDefinition<TMeta>(node)) {
			result.push({
				...node,
				keySegments,
			});
			return;
		}

		Object.entries(node).forEach(([key, child]) => {
			visit(child as ContractTree<TMeta>, [...keySegments, key]);
		});
	};

	visit(tree as ContractTree<TMeta>, []);
	return result;
};

export type ContractResponse<E extends Contract> = E extends {
	response: infer R;
}
	? R extends z.ZodType
		? IsStreamContract<E> extends true
			? AsyncIterable<z.infer<R>>
			: z.infer<R>
		: never
	: undefined;

export type IsStreamContract<E extends Contract> = E extends {
	options: { mode: "stream" };
}
	? true
	: false;

export type IsWebSocketContract<E extends Contract> = E extends {
	options: { mode: "websocket" };
}
	? true
	: false;

export type ContractClientMessage<E extends Contract> = E extends {
	messages: { client: infer R };
}
	? R extends z.ZodType
		? z.infer<R>
		: never
	: never;

export type ContractServerMessage<E extends Contract> = E extends {
	messages: { server: infer R };
}
	? R extends z.ZodType
		? z.infer<R>
		: never
	: never;

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

export type ContractApiError<
	T extends ContractTree,
	P extends DotPaths<T>,
> = ContractError<ContractAtPath<T, P>>;

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
