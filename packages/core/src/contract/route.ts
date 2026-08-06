import type { StandardSchemaV1 } from "../standard-schema/index.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type RequestSegment = "body" | "query" | "params" | "headers";
export type RequestKeys = Record<string, RequestSegment>;

export type NoBody = {
	kind: "noBody";
};

export type RequestSchemaRecord = Record<string, StandardSchemaV1>;

export type RequestBodySchema =
	| StandardSchemaV1
	| RequestSchemaRecord
	| CustomBody
	| NoBody
	| undefined;

export type RequestSchema = {
	body?: RequestBodySchema;
	query?: StandardSchemaV1 | RequestSchemaRecord;
	params?: StandardSchemaV1 | RequestSchemaRecord;
	headers?: RequestSchemaRecord;
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

export const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
	typeof value === "object" && value !== null && "~standard" in value;

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
			: TBody extends RequestSchemaRecord
				? InferRequestSchemaRecord<TBody>
				: never;

type InferSchemaValue<TSchema> = TSchema extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TSchema>
	: never;

type OptionalSchemaRecordKeys<TRecord extends RequestSchemaRecord> = {
	[K in keyof TRecord]: undefined extends InferSchemaValue<TRecord[K]>
		? K
		: never;
}[keyof TRecord];

type RequiredSchemaRecordKeys<TRecord extends RequestSchemaRecord> = Exclude<
	keyof TRecord,
	OptionalSchemaRecordKeys<TRecord>
>;

type InferRequestSchemaRecord<TRecord extends RequestSchemaRecord> = Merge<
	{
		[K in RequiredSchemaRecordKeys<TRecord>]: InferSchemaValue<TRecord[K]>;
	} & {
		[K in OptionalSchemaRecordKeys<TRecord>]?: InferSchemaValue<TRecord[K]>;
	}
>;

type InferRequestObjectSegment<TSegment> = TSegment extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TSegment>
	: TSegment extends RequestSchemaRecord
		? InferRequestSchemaRecord<TSegment>
		: never;

type HeaderValue = string | number | boolean | undefined;
type RequestObjectValue = Record<string, unknown>;

type HeaderSchemaValueError = {
	readonly __route_error__: "Header schema must output string, number, boolean, or undefined.";
};

type RequestSchemaObjectError<TSegment extends RequestSegment> = {
	readonly __route_error__: `${TSegment} schema must output an object, or a union where every branch outputs an object. Use customBody() for non-object request bodies.`;
};

type SchemaOutputsOnly<TSchema, TValue> = [
	Exclude<
		TSchema extends StandardSchemaV1
			? StandardSchemaV1.InferOutput<TSchema>
			: never,
		TValue
	>,
] extends [never]
	? true
	: false;

type InvalidHeaderKeys<THeaders extends RequestSchemaRecord> = {
	[K in keyof THeaders]: SchemaOutputsOnly<
		THeaders[K],
		HeaderValue
	> extends true
		? never
		: K;
}[keyof THeaders];

type ValidateHeaderRecord<THeaders extends RequestSchemaRecord> = [
	InvalidHeaderKeys<THeaders>,
] extends [never]
	? unknown
	: HeaderSchemaValueError;

type ValidateRequestObjectSchema<
	TSchema,
	TSegment extends RequestSegment,
> = TSchema extends StandardSchemaV1
	? SchemaOutputsOnly<TSchema, RequestObjectValue> extends true
		? unknown
		: RequestSchemaObjectError<TSegment>
	: unknown;

type InferRequestSegments<R> = {
	body: R extends { body: infer TBody } ? InferRequestBody<TBody> : never;
	query: R extends { query: infer TQuery }
		? InferRequestObjectSegment<TQuery>
		: never;
	params: R extends { params: infer TParams }
		? InferRequestObjectSegment<TParams>
		: never;
	headers: R extends { headers: infer THeaders }
		? THeaders extends RequestSchemaRecord
			? InferRequestSchemaRecord<THeaders>
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

export type ValidateHeaderSchemas<T> = T extends RouteDeclaration
	? T extends {
			request: {
				headers: infer THeaders extends RequestSchemaRecord;
			};
		}
		? ValidateHeaderRecord<THeaders>
		: unknown
	: T extends object
		? {
				[K in keyof T]: ValidateHeaderSchemas<T[K]>;
			}
		: unknown;

export type ValidateRequestObjectSchemas<T> = T extends RouteDeclaration
	? T extends {
			request: infer TRequest;
		}
		? (TRequest extends { body: infer TBody }
				? ValidateRequestObjectSchema<TBody, "body">
				: unknown) &
				(TRequest extends { query: infer TQuery }
					? ValidateRequestObjectSchema<TQuery, "query">
					: unknown) &
				(TRequest extends { params: infer TParams }
					? ValidateRequestObjectSchema<TParams, "params">
					: unknown)
		: unknown
	: T extends object
		? {
				[K in keyof T]: ValidateRequestObjectSchemas<T[K]>;
			}
		: unknown;
