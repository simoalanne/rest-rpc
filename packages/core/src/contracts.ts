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

export type RouteResponses = Record<number, ResponseBodySchema>;

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

export type JsonRouteDeclaration<TMeta = unknown> = BaseContract<TMeta> & {
	responses: RouteResponses;
	options?: { mode?: "json" };
};

export type RawRequestRouteDeclaration<TMeta = unknown> =
	BaseContract<TMeta> & {
		responses: RouteResponses;
		request?: Omit<RequestSchema, "body">;
		options: { mode: "raw" };
	};

export type WebSocketRouteDeclaration<TMeta = unknown> = BaseContract<TMeta> & {
	method: "GET";
	options: { mode: "websocket" };
	messages: {
		client: z.ZodType;
		server: z.ZodType;
	};
};

export type RouteDeclaration<TMeta = unknown> =
	| JsonRouteDeclaration<TMeta>
	| RawRequestRouteDeclaration<TMeta>
	| WebSocketRouteDeclaration<TMeta>;

export type Contract<TMeta = unknown> =
	| RouteDeclaration<TMeta>
	| { [k: string]: Contract<TMeta> };

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
): value is RouteDeclaration<TMeta> =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

export const mapContractRoutes = <TMeta = unknown>(
	contract: Contract<TMeta>,
	mappingFn: (route: RouteDeclaration<TMeta>, path: string[]) => unknown,
) => mapObjectValues(contract, isContractDefinition, mappingFn);

export type ContractRoute<TMeta = unknown> = RouteDeclaration<TMeta> & {
	keySegments: string[];
};

export const flattenContractRoutes = <
	TMeta = unknown,
	TContract extends Contract<TMeta> = Contract<TMeta>,
>(
	contract: TContract,
): ContractRoute<TMeta>[] => {
	const result: ContractRoute<TMeta>[] = [];

	const visit = (node: Contract<TMeta>, keySegments: string[]) => {
		if (isContractDefinition<TMeta>(node)) {
			result.push({
				...node,
				keySegments,
			});
			return;
		}

		Object.entries(node).forEach(([key, child]) => {
			visit(child as Contract<TMeta>, [...keySegments, key]);
		});
	};

	visit(contract as Contract<TMeta>, []);
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

export type InferRouteResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
				: never;
		}[keyof TResponses]
	: never;

export type InferRouteSuccessResponse<E extends RouteDeclaration> = E extends {
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

export type InferRouteSuccessBody<E extends RouteDeclaration> =
	InferRouteSuccessResponse<E> extends infer TResponse extends {
		body: unknown;
	}
		? [TResponse] extends [never]
			? never
			: IsUnion<TResponse> extends true
				? never
				: TResponse["body"]
		: never;

export type InferRouteErrors<E extends RouteDeclaration> = Exclude<
	InferRouteResponse<E>,
	InferRouteSuccessResponse<E>
>;

export type IsRawRequestRoute<E extends RouteDeclaration> = E extends {
	options: { mode: "raw" };
}
	? true
	: false;

export type IsWebSocketRoute<E extends RouteDeclaration> = E extends {
	options: { mode: "websocket" };
}
	? true
	: false;

export type InferRouteClientMessage<E extends RouteDeclaration> = E extends {
	messages: { client: infer R };
}
	? R extends z.ZodType
		? z.infer<R>
		: never
	: never;

export type InferRouteServerMessage<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? R extends z.ZodType
		? z.infer<R>
		: never
	: never;

type InferRequest<R> = {
	[K in keyof R]: R[K] extends z.ZodType ? z.infer<R[K]> : never;
};

type RawRequest<E extends RouteDeclaration> = E extends {
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

export type InferRouteRequest<E extends RouteDeclaration> =
	RawRequest<E> extends infer R
		? R extends { body?: infer B; query?: infer Q; params?: infer P }
			? Merge<B & Q & P>
			: R
		: never;

type WithMetaMarker<T, TMeta> =
	T extends RouteDeclaration<TMeta>
		? T & { $meta?: TMeta }
		: {
				[K in keyof T]: T[K] extends Contract<TMeta>
					? WithMetaMarker<T[K], TMeta>
					: never;
			};

type MissingSuccessfulResponseError = {
	readonly __contract_error__: "Contract must declare at least one successful response.";
};

type StreamResponseStatusError = {
	readonly __contract_error__: "Contracts with a stream response cannot define more than one successful status code.";
};

type ValidateResponseStatuses<T> = T extends RouteDeclaration
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

const validateContract = (contract: Contract) => {
	for (const route of flattenContractRoutes(contract)) {
		if (route.request) {
			const requestKeySets = [
				getRequestSchemaKeySet(route.request.body),
				getRequestSchemaKeySet(route.request.query),
				getRequestSchemaKeySet(route.request.params),
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
					`Route declaration at path "${route.path}" has duplicate request keys across its "body", "query" and "params" definitions.`,
				);
			}
		}
	}
};

type ContractTools<TMeta> = {
	defineContract: <const TContract extends Contract<TMeta>>(
		contract: TContract & ValidateResponseStatuses<TContract>,
	) => WithMetaMarker<TContract, TMeta>;
};

export const initContracts = <TMeta = unknown>(): ContractTools<TMeta> => ({
	defineContract: (contract) => {
		validateContract(contract);
		return contract as never;
	},
});
