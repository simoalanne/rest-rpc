import type z from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type RequestBodySchema = z.ZodObject | z.ZodDiscriminatedUnion;

export type RequestSchema = {
	body?: RequestBodySchema;
	query?: z.ZodObject;
	params?: z.ZodObject;
};

export type RawRequestBody = unknown;

export type ResponseSchema = z.ZodType;
export const noBody = Symbol("NoBodyResponse");

export type NoBodyResponse = typeof noBody;

export type StreamResponse<TSchema extends z.ZodType = z.ZodType> = {
	kind: "stream";
	schema: TSchema;
};

export type ResponseBodySchema =
	| ResponseSchema
	| NoBodyResponse
	| StreamResponse;

export type ContractResponses = Record<number, ResponseBodySchema>;

export const stream = <const TSchema extends z.ZodType>(
	schema: TSchema,
): StreamResponse<TSchema> => ({
	kind: "stream",
	schema,
});

export const isNoBodyResponse = (
	response: ResponseBodySchema,
): response is NoBodyResponse => response === noBody;

export const isStreamResponse = (
	response: ResponseBodySchema,
): response is StreamResponse =>
	typeof response === "object" &&
	response !== null &&
	"kind" in response &&
	response.kind === "stream";

export type ContractOptions = {
	mode?: "json" | "raw" | "websocket";
};

export type BaseContract<TMeta = unknown> = {
	path: string;
	method: HttpMethod;
	request?: RequestSchema;
	meta?: TMeta;
	$meta?: TMeta;
};

export type JsonContract<TMeta = unknown> = BaseContract<TMeta> & {
	responses: ContractResponses;
	options?: { mode?: "json" };
};

export type RawRequestContract<TMeta = unknown> = BaseContract<TMeta> & {
	responses: ContractResponses;
	request?: Omit<RequestSchema, "body">;
	options: { mode: "raw" };
};

export type WebSocketContract<TMeta = unknown> = BaseContract<TMeta> & {
	method: "GET";
	options: { mode: "websocket" };
	messages: {
		client: z.ZodType;
		server: z.ZodType;
	};
};

export type Contract<TMeta = unknown> =
	| JsonContract<TMeta>
	| RawRequestContract<TMeta>
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
	mappingFn: (contract: Contract<TMeta>, path: string[]) => unknown,
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

export type InferResponseBody<TResponse> = TResponse extends z.ZodType
	? z.infer<TResponse>
	: TResponse extends NoBodyResponse
		? undefined
		: TResponse extends StreamResponse<infer TSchema>
			? AsyncIterable<z.infer<TSchema>>
			: never;

type ResponseEntry<TStatus extends number, TResponse> = {
	status: TStatus;
	body: InferResponseBody<TResponse>;
};

type ResponseKey = number | `${number}`;

type ResponseStatus<TStatus> = TStatus extends number
	? TStatus
	: TStatus extends `${infer TNumber extends number}`
		? TNumber
		: never;

export type IsUnion<T, U = T> = [T] extends [never]
	? false
	: T extends unknown
		? [U] extends [T]
			? false
			: true
		: false;

export type SuccessfulResponseKeys<TResponses> = {
	[TKeys in keyof TResponses]: TKeys extends ResponseKey
		? `${ResponseStatus<TKeys>}` extends `2${string}`
			? TKeys
			: never
		: never;
}[keyof TResponses];

export type HasSuccessfulResponse<TResponses> = [
	SuccessfulResponseKeys<TResponses>,
] extends [never]
	? false
	: true;

export type HasMultipleSuccessfulResponses<TResponses> = IsUnion<
	SuccessfulResponseKeys<TResponses>
>;

export type HasStreamResponse<TResponses> = true extends {
	[TKeys in keyof TResponses]: TResponses[TKeys] extends StreamResponse
		? true
		: false;
}[keyof TResponses]
	? true
	: false;

export type ContractResponse<E extends Contract> = E extends {
	responses: infer TResponses;
}
	? {
		  [TKeys in keyof TResponses]: TKeys extends ResponseKey
			  ? ResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
			  : never;
	  }[keyof TResponses]
	: never;

export type ContractSuccessfulResponse<E extends Contract> = E extends {
	responses: infer TResponses;
}
	? {
		  [TKeys in keyof TResponses]: TKeys extends ResponseKey
			  ? TKeys extends SuccessfulResponseKeys<TResponses>
				  ? ResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
				  : never
			  : never;
	  }[keyof TResponses]
	: never;

export type ContractSingleSuccessfulResponseBody<E extends Contract> =
	ContractSuccessfulResponse<E> extends infer TResponse extends {
		body: unknown;
	}
		? [TResponse] extends [never]
			? never
			: IsUnion<TResponse> extends true
				? never
				: TResponse["body"]
		: never;

export type ContractNonSuccessfulResponse<E extends Contract> = Exclude<
	ContractResponse<E>,
	ContractSuccessfulResponse<E>
>;

export type IsRawRequestContract<E extends Contract> = E extends {
	options: { mode: "raw" };
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

type MissingSuccessfulResponseError = {
	readonly __contract_error__: "Contract must declare at least one successful response.";
};

type StreamResponseStatusError = {
	readonly __contract_error__: "Contracts with a stream response cannot define more than one successful status code.";
};

type ValidateResponseStatuses<T> = T extends Contract
	? T extends { responses: infer TResponses }
		? HasSuccessfulResponse<TResponses> extends false
			? MissingSuccessfulResponseError
			: HasStreamResponse<TResponses> extends true
				? HasMultipleSuccessfulResponses<TResponses> extends true
					? StreamResponseStatusError
					: unknown
				: unknown
		: unknown
	: T extends object
		? {
				[K in keyof T]: ValidateResponseStatuses<T[K]>;
			}
		: unknown;

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
	}
};

type ContractTools<TMeta> = {
	defineContractTree: <const TContract extends ContractTree<TMeta>>(
		contract: TContract & ValidateResponseStatuses<TContract>,
	) => WithMetaMarker<TContract, TMeta>;
};

export const initContracts = <TMeta = unknown>(): ContractTools<TMeta> => ({
	defineContractTree: (contract) => {
		validateContractTree(contract);
		return contract as never;
	},
});
