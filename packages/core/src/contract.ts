import type z from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type RequestBodySchema =
	| z.ZodObject
	| z.ZodDiscriminatedUnion
	| CustomBody
	| undefined;

export type RequestSchema = {
	body?: RequestBodySchema;
	query?: z.ZodObject;
	params?: z.ZodObject;
};

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
type RouteMetadata = Record<string, unknown>;

export const stream = <const TSchema extends z.ZodType>(
	schema: TSchema,
): StreamResponse<TSchema> => ({
	kind: "stream",
	schema,
});

export type CustomBody<TSchema extends z.ZodType = z.ZodType> = {
	kind: "customBody";
	schema: TSchema;
	contentType: string;
};

export const customBody = <const TSchema extends z.ZodType>(input: {
	schema: TSchema;
	contentType: string;
}): CustomBody<TSchema> => ({
	kind: "customBody",
	schema: input.schema,
	contentType: input.contentType,
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

export const isCustomBody = (
	schema: RequestBodySchema,
): schema is CustomBody =>
	typeof schema === "object" &&
	schema !== null &&
	"kind" in schema &&
	schema.kind === "customBody";

export type ContractOptions = {
	mode?: "http" | "websocket";
};

export type BaseRouteDeclaration = {
	path: string;
	method: HttpMethod;
	request?: RequestSchema;
	metadata?: RouteMetadata;
};

export type HttpRouteDeclaration = BaseRouteDeclaration & {
	responses: RouteResponses;
	options?: { mode?: "http" };
	messages?: never;
};

export type WebSocketRouteDeclaration = BaseRouteDeclaration & {
	method: "GET";
	options: { mode: "websocket" };
	messages: {
		client: z.ZodType;
		server: z.ZodType;
	};
	responses?: never;
};

export type RouteDeclaration = HttpRouteDeclaration | WebSocketRouteDeclaration;

export type Contract = RouteDeclaration | { [k: string]: Contract };

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

const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

export const mapContractRoutes = (
	contract: Contract,
	mappingFn: (route: RouteDeclaration, path: string[]) => unknown,
) => mapObjectValues(contract, isRouteDeclaration, mappingFn);

const forEachContractRoute = (
	contract: Contract,
	visitRoute: (route: RouteDeclaration) => void,
) => {
	const visit = (node: Contract) => {
		if (isRouteDeclaration(node)) {
			visitRoute(node);
			return;
		}

		Object.values(node).forEach((child) => {
			visit(child as Contract);
		});
	};

	visit(contract);
};

export const flattenContractRoutes = <TContract extends Contract = Contract>(
	contract: TContract,
): RouteDeclaration[] => {
	const result: RouteDeclaration[] = [];

	forEachContractRoute(contract as Contract, (route) => {
		result.push(route);
	});

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

type InferRequestBody<TBody> =
	TBody extends CustomBody<infer TSchema>
		? { body: z.infer<TSchema> }
		: TBody extends z.ZodType
			? z.infer<TBody>
			: never;

type InferRequest<R> = {
	[K in keyof R]: K extends "body"
		? InferRequestBody<R[K]>
		: R[K] extends z.ZodType
			? z.infer<R[K]>
			: never;
};

type RouteRequest<E extends RouteDeclaration> = E extends {
	request: infer R;
}
	? InferRequest<R>
	: never;

type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;

export type InferRouteRequest<E extends RouteDeclaration> =
	RouteRequest<E> extends infer R
		? R extends { body?: infer B; query?: infer Q; params?: infer P }
			? Merge<B & Q & P>
			: R
		: never;

type MissingSuccessfulResponseError = {
	readonly __route_error__: "Route must declare at least one successful response.";
};

type StreamResponseStatusError = {
	readonly __route_error__: "Routes with a stream response cannot define more than one successful status code.";
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
	schema: z.ZodDiscriminatedUnion | z.ZodObject | undefined,
) => {
	if (!schema) return new Set<string>();

	if ("options" in schema) {
		return new Set(
			schema.options.flatMap((option) =>
				Object.keys((option as z.ZodObject).shape),
			),
		);
	}

	return new Set(Object.keys(schema.shape));
};

type CommonContractOptions = {
	pathPrefix?: string;
	metadata?: RouteMetadata;
};

const joinPathPrefix = (prefix: string, path: string) => {
	const normalizedPrefix = prefix.replace(/\/+$/, "");
	const normalizedPath = path.replace(/^\/+/, "");

	if (!normalizedPrefix) return normalizedPath ? `/${normalizedPath}` : "/";
	if (!normalizedPath) return normalizedPrefix;

	return `${normalizedPrefix}/${normalizedPath}`;
};

const validateContract = (
	contract: Contract,
	commonOptions?: CommonContractOptions,
) => {
	forEachContractRoute(contract, (route) => {
		if (commonOptions?.pathPrefix) {
			route.path = joinPathPrefix(commonOptions.pathPrefix, route.path);
		}

		route.metadata = {
			...commonOptions?.metadata,
			...route.metadata,
		};

		if (route.request) {
			const toBeFlattenedBodySchema = isCustomBody(route.request.body)
				? undefined
				: route.request.body;
			const requestKeySets = [
				getRequestSchemaKeys(toBeFlattenedBodySchema),
				getRequestSchemaKeys(route.request.query),
				getRequestSchemaKeys(route.request.params),
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

			if (isCustomBody(route.request.body)) {
				if (uniqueRequestKeys.has("body")) {
					throw new Error(
						`Route declaration at path "${route.path}" has a "body" key in query or params. Rename it to avoid conflict with the request body.`,
					);
				}
			}
		}
	});

	return contract;
};

export const defineContract = <const TContract extends Contract>(
	contract: TContract & ValidateResponseStatuses<TContract>,
	commonOptions?: CommonContractOptions,
): TContract => {
	return validateContract(contract, commonOptions) as TContract;
};
