import type { StandardSchemaV1 } from "../standard-schema/index.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type RequestSegment = "body" | "query" | "params" | "headers";
export type RequestKeys = Record<string, RequestSegment>;

export type NoBody = {
	kind: "noBody";
};

export type RequestBodySchema =
	| StandardSchemaV1
	| CustomBody
	| NoBody
	| undefined;

export type RequestSchema = {
	body?: RequestBodySchema;
	query?: StandardSchemaV1;
	params?: StandardSchemaV1;
	headers?: Record<string, StandardSchemaV1>;
	requestKeys?: RequestKeys;
};

export type ResponseSchema = StandardSchemaV1;

export const noBody = (): NoBody => ({
	kind: "noBody",
});

export type StreamBody<TSchema extends StandardSchemaV1 = StandardSchemaV1> = {
	kind: "streamBody";
	schema: TSchema;
};

export type ResponseBodySchema = ResponseSchema | NoBody | StreamBody;

export type RouteResponses = Record<number, ResponseBodySchema>;
export type RouteMetadata = Record<string, unknown>;

export const streamBody = <const TSchema extends StandardSchemaV1>(
	schema: TSchema,
): StreamBody<TSchema> => ({
	kind: "streamBody",
	schema,
});

export type CustomBody<TSchema extends StandardSchemaV1 = StandardSchemaV1> = {
	kind: "customBody";
	schema: TSchema;
	contentType: string;
};

export const customBody = <const TSchema extends StandardSchemaV1>(input: {
	schema: TSchema;
	contentType: string;
}): CustomBody<TSchema> => ({
	kind: "customBody",
	schema: input.schema,
	contentType: input.contentType,
});

export const isNoBody = (
	body: RequestBodySchema | ResponseBodySchema,
): body is NoBody =>
	typeof body === "object" &&
	body !== null &&
	"kind" in body &&
	body.kind === "noBody";

export const isStreamBody = (
	response: ResponseBodySchema,
): response is StreamBody =>
	typeof response === "object" &&
	response !== null &&
	"kind" in response &&
	response.kind === "streamBody";

export const isCustomBody = (schema: RequestBodySchema): schema is CustomBody =>
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
		client: StandardSchemaV1;
		server: StandardSchemaV1;
	};
	responses?: never;
};

export type RouteDeclaration = HttpRouteDeclaration | WebSocketRouteDeclaration;

export type Contract = RouteDeclaration | { [k: string]: Contract };

export const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

export type InferResponseBody<TResponse> = TResponse extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TResponse>
	: TResponse extends NoBody
		? undefined
		: TResponse extends StreamBody<infer TSchema>
			? AsyncIterable<StandardSchemaV1.InferOutput<TSchema>>
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

export type HasStreamBody<TResponses> = true extends {
	[TKeys in keyof TResponses]: TResponses[TKeys] extends StreamBody
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
	? R extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<R>
		: never
	: never;

export type InferRouteServerMessage<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? R extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<R>
		: never
	: never;

type InferRequestBody<TBody> = TBody extends NoBody
	? never
	: TBody extends CustomBody<infer TSchema>
		? { body: StandardSchemaV1.InferOutput<TSchema> }
		: TBody extends StandardSchemaV1
			? StandardSchemaV1.InferOutput<TBody>
			: never;

type InferHeaderValue<TSchema> = TSchema extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TSchema>
	: never;

type OptionalHeaderKeys<THeaders extends Record<string, StandardSchemaV1>> = {
	[K in keyof THeaders]: undefined extends InferHeaderValue<THeaders[K]>
		? K
		: never;
}[keyof THeaders];

type RequiredHeaderKeys<THeaders extends Record<string, StandardSchemaV1>> =
	Exclude<keyof THeaders, OptionalHeaderKeys<THeaders>>;

type InferRequestHeaders<THeaders extends Record<string, StandardSchemaV1>> =
	Merge<
		{
			[K in RequiredHeaderKeys<THeaders>]: InferHeaderValue<THeaders[K]>;
		} & {
			[K in OptionalHeaderKeys<THeaders>]?: InferHeaderValue<THeaders[K]>;
		}
	>;

type InferRequestSegments<R> = {
	body: R extends { body: infer TBody } ? InferRequestBody<TBody> : never;
	query: R extends { query: infer TQuery }
		? TQuery extends StandardSchemaV1
			? StandardSchemaV1.InferOutput<TQuery>
			: never
		: never;
	params: R extends { params: infer TParams }
		? TParams extends StandardSchemaV1
			? StandardSchemaV1.InferOutput<TParams>
			: never
		: never;
	headers: R extends { headers: infer THeaders }
		? THeaders extends Record<string, StandardSchemaV1>
			? InferRequestHeaders<THeaders>
			: never
		: never;
};

type RouteRequest<E extends RouteDeclaration> = E extends {
	request: infer R;
}
	? InferRequestSegments<R>
	: never;

type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;
type MergeSegment<T> = [T] extends [never] ? unknown : T;
type HasRequestInput<TRequest> = [
	TRequest extends {
		body: infer TBody;
		query: infer TQuery;
		params: infer TParams;
		headers: infer THeaders;
	}
		? TBody | TQuery | TParams | THeaders
		: never,
] extends [never]
	? false
	: true;

export type InferRouteRequest<E extends RouteDeclaration> =
	RouteRequest<E> extends infer R
		? R extends {
				body: infer B;
				query: infer Q;
				params: infer P;
				headers: infer H;
			}
			? HasRequestInput<R> extends true
				? Merge<
						MergeSegment<B> &
							MergeSegment<Q> &
							MergeSegment<P> &
							MergeSegment<H>
					>
				: never
			: never
		: never;

type MissingSuccessfulResponseError = {
	readonly __route_error__: "Route must declare at least one successful response.";
};

type StreamBodyStatusError = {
	readonly __route_error__: "Routes with a stream response cannot define more than one successful status code.";
};

export type ValidateResponseStatuses<T> = T extends RouteDeclaration
	? T extends { responses: infer TResponses }
		? HasSuccessfulResponse<TResponses> extends false
			? MissingSuccessfulResponseError
			: HasStreamBody<TResponses> extends true
				? HasMultipleSuccessfulResponses<TResponses> extends true
					? StreamBodyStatusError
					: unknown
				: unknown
		: unknown
	: T extends object
		? {
				[K in keyof T]: ValidateResponseStatuses<T[K]>;
			}
		: unknown;
