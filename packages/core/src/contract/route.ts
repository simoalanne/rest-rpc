import type { StandardSchemaV1 } from "../standard-schema/index.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type RequestSegment = "body" | "query" | "params" | "headers";
export type RequestKeys = Record<string, RequestSegment>;
export const REQUEST_CONTEXT_KEY = "context";
type RequestPrimitive = string | number | boolean;
type OptionalRequestPrimitive = RequestPrimitive | undefined;

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

export type CustomBody<TSchema extends StandardSchemaV1 = StandardSchemaV1> = {
	kind: "customBody";
	schema: TSchema;
	contentType: string;
};

export type Stream<
	TBody extends ResponseSchema | CustomBody = ResponseSchema | CustomBody,
> = {
	kind: "stream";
	schema: TBody;
};

export type ResponseBodySchema = ResponseSchema | NoBody | CustomBody | Stream;

export type RouteResponses = Record<number, ResponseBodySchema>;
export type RouteMetadata = Record<string, unknown>;
export type OpenApiRouteOptions = {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: string[];
	deprecated?: boolean;
	security?: Array<Record<string, string[]>>;
	externalDocs?: { url: string; description?: string };
	responseDescriptions?: Record<number, string>;
	extensions?: Record<`x-${string}`, unknown>;
};
export type CommonOpenApiRouteOptions = Omit<
	OpenApiRouteOptions,
	"summary" | "description" | "operationId"
>;

export const stream = <const TBody extends ResponseSchema | CustomBody>(
	schema: TBody,
): Stream<TBody> => ({
	kind: "stream",
	schema,
});

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

export const isStream = (response: ResponseBodySchema): response is Stream =>
	typeof response === "object" &&
	response !== null &&
	"kind" in response &&
	response.kind === "stream";

export const isCustomBody = (schema: unknown): schema is CustomBody =>
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
	openApi?: OpenApiRouteOptions;
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

export const isRequestSchemaRecord = (
	value: unknown,
): value is RequestSchemaRecord =>
	typeof value === "object" &&
	value !== null &&
	!isStandardSchema(value) &&
	!isCustomBody(value as RequestBodySchema) &&
	!isNoBody(value as RequestBodySchema);

type InferCustomBody<TResponse, TIO extends "input" | "output"> =
	TResponse extends CustomBody<infer TSchema>
		? TIO extends "input"
			? StandardSchemaV1.InferInput<TSchema>
			: StandardSchemaV1.InferOutput<TSchema>
		: never;

export type InferClientResponseBody<TResponse> =
	TResponse extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<TResponse>
		: TResponse extends NoBody
			? undefined
			: TResponse extends CustomBody
				? Response
				: TResponse extends Stream<infer TBody>
					? TBody extends CustomBody
						? Response
						: TBody extends StandardSchemaV1
							? AsyncIterable<StandardSchemaV1.InferOutput<TBody>>
							: never
					: never;

export type InferServerResponseBody<TResponse> =
	TResponse extends StandardSchemaV1
		? StandardSchemaV1.InferInput<TResponse>
		: TResponse extends NoBody
			? undefined
			: TResponse extends CustomBody
				? InferCustomBody<TResponse, "input">
				: TResponse extends Stream<infer TBody>
					? TBody extends CustomBody
						? AsyncIterable<InferCustomBody<TBody, "input">>
						: TBody extends StandardSchemaV1
							? AsyncIterable<StandardSchemaV1.InferInput<TBody>>
							: never
					: never;

type ResponseEntry<TStatus extends number, TBody> = {
	status: TStatus;
	body: TBody;
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

export type InferClientResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ResponseEntry<
						ResponseStatus<TKeys>,
						InferClientResponseBody<TResponses[TKeys]>
					>
				: never;
		}[keyof TResponses]
	: never;

export type InferServerResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ResponseEntry<
						ResponseStatus<TKeys>,
						InferServerResponseBody<TResponses[TKeys]>
					>
				: never;
		}[keyof TResponses]
	: never;

export type InferClientSuccessResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? TKeys extends SuccessfulResponseKeys<TResponses>
					? ResponseEntry<
							ResponseStatus<TKeys>,
							InferClientResponseBody<TResponses[TKeys]>
						>
					: never
				: never;
		}[keyof TResponses]
	: never;

export type InferServerSuccessResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? TKeys extends SuccessfulResponseKeys<TResponses>
					? ResponseEntry<
							ResponseStatus<TKeys>,
							InferServerResponseBody<TResponses[TKeys]>
						>
					: never
				: never;
		}[keyof TResponses]
	: never;

type InferSingleResponseBody<TResponse> = [TResponse] extends [never]
	? never
	: IsUnion<TResponse> extends true
		? never
		: TResponse extends { body: infer TBody }
			? TBody
			: never;

export type InferClientSuccessBody<E extends RouteDeclaration> =
	InferSingleResponseBody<InferClientSuccessResponse<E>>;

export type InferServerSuccessBody<E extends RouteDeclaration> =
	InferSingleResponseBody<InferServerSuccessResponse<E>>;

export type InferClientErrors<E extends RouteDeclaration> = Exclude<
	InferClientResponse<E>,
	InferClientSuccessResponse<E>
>;

export type InferServerErrors<E extends RouteDeclaration> = Exclude<
	InferServerResponse<E>,
	InferServerSuccessResponse<E>
>;

export type IsWebSocketRoute<E extends RouteDeclaration> = E extends {
	options: { mode: "websocket" };
}
	? true
	: false;

export type InferClientMessage<E extends RouteDeclaration> = E extends {
	messages: { client: infer R };
}
	? R extends StandardSchemaV1
		? StandardSchemaV1.InferInput<R>
		: never
	: never;

export type InferReceivedClientMessage<E extends RouteDeclaration> = E extends {
	messages: { client: infer R };
}
	? R extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<R>
		: never
	: never;

export type InferServerMessage<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? R extends StandardSchemaV1
		? StandardSchemaV1.InferInput<R>
		: never
	: never;

export type InferReceivedServerMessage<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? R extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<R>
		: never
	: never;

type InferRequestBody<
	TBody,
	TIO extends "input" | "output",
> = TBody extends NoBody
	? never
	: TBody extends CustomBody
		? {
				body: InferCustomBody<TBody, TIO>;
			}
		: TBody extends StandardSchemaV1
			? TIO extends "input"
				? StandardSchemaV1.InferInput<TBody>
				: StandardSchemaV1.InferOutput<TBody>
			: TBody extends RequestSchemaRecord
				? InferRequestSchemaRecord<TBody, TIO>
				: never;

type InferSchemaValue<
	TSchema,
	TIO extends "input" | "output",
> = TSchema extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<TSchema>
		: StandardSchemaV1.InferOutput<TSchema>
	: never;

type OptionalSchemaRecordKeys<
	TRecord extends RequestSchemaRecord,
	TIO extends "input" | "output",
> = {
	[K in keyof TRecord]: undefined extends InferSchemaValue<TRecord[K], TIO>
		? K
		: never;
}[keyof TRecord];

type RequiredSchemaRecordKeys<
	TRecord extends RequestSchemaRecord,
	TIO extends "input" | "output",
> = Exclude<keyof TRecord, OptionalSchemaRecordKeys<TRecord, TIO>>;

type InferRequestSchemaRecord<
	TRecord extends RequestSchemaRecord,
	TIO extends "input" | "output",
> = Merge<
	{
		[K in RequiredSchemaRecordKeys<TRecord, TIO>]: InferSchemaValue<
			TRecord[K],
			TIO
		>;
	} & {
		[K in OptionalSchemaRecordKeys<TRecord, TIO>]?: InferSchemaValue<
			TRecord[K],
			TIO
		>;
	}
>;

type InferRequestObjectSegment<
	TSegment,
	TIO extends "input" | "output",
> = TSegment extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<TSegment>
		: StandardSchemaV1.InferOutput<TSegment>
	: TSegment extends RequestSchemaRecord
		? InferRequestSchemaRecord<TSegment, TIO>
		: never;

type RequestObjectValue = Record<string, unknown>;

type HeaderSchemaValueError = {
	readonly __route_error__: "Header schema must input string, number, boolean, or undefined.";
};

type QuerySchemaValueError = {
	readonly __route_error__: "Query schema values must input string, number, boolean, or undefined.";
};

type ParamsSchemaValueError = {
	readonly __route_error__: "Params schema values must input string, number, or boolean.";
};

type RequestSchemaObjectError<TSegment extends RequestSegment> = {
	readonly __route_error__: `${TSegment} schema must output an object, or a union where every branch outputs an object. Use customBody() for non-object request bodies.`;
};

type SchemaInputsOnly<TSchema, TValue> = [
	Exclude<
		TSchema extends StandardSchemaV1
			? StandardSchemaV1.InferInput<TSchema>
			: never,
		TValue
	>,
] extends [never]
	? true
	: false;

type InvalidRequestRecordKeys<TRecord extends RequestSchemaRecord, TValue> = {
	[K in keyof TRecord]: SchemaInputsOnly<TRecord[K], TValue> extends true
		? never
		: K;
}[keyof TRecord];

type ValidateRequestRecord<
	TRecord extends RequestSchemaRecord,
	TValue,
	TError,
> = [InvalidRequestRecordKeys<TRecord, TValue>] extends [never]
	? unknown
	: TError;

type ValidateHeaderRecord<THeaders extends RequestSchemaRecord> =
	ValidateRequestRecord<
		THeaders,
		OptionalRequestPrimitive,
		HeaderSchemaValueError
	>;

type ValidateQueryRecord<TQuery extends RequestSchemaRecord> =
	ValidateRequestRecord<
		TQuery,
		OptionalRequestPrimitive,
		QuerySchemaValueError
	>;

type ValidateParamsRecord<TParams extends RequestSchemaRecord> =
	ValidateRequestRecord<TParams, RequestPrimitive, ParamsSchemaValueError>;

type ValidateRequestObjectSchema<
	TSchema,
	TSegment extends RequestSegment,
> = TSchema extends StandardSchemaV1
	? SchemaInputsOnly<TSchema, RequestObjectValue> extends true
		? unknown
		: RequestSchemaObjectError<TSegment>
	: unknown;

type InferRequestSegments<R, TIO extends "input" | "output"> = {
	body: R extends { body: infer TBody } ? InferRequestBody<TBody, TIO> : never;
	query: R extends { query: infer TQuery }
		? InferRequestObjectSegment<TQuery, TIO>
		: never;
	params: R extends { params: infer TParams }
		? InferRequestObjectSegment<TParams, TIO>
		: never;
	headers: R extends { headers: infer THeaders }
		? THeaders extends RequestSchemaRecord
			? InferRequestSchemaRecord<THeaders, TIO>
			: never
		: never;
};

type RouteRequest<
	E extends RouteDeclaration,
	TIO extends "input" | "output",
> = E extends {
	request: infer R;
}
	? InferRequestSegments<R, TIO>
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

type InferRequestFor<
	E extends RouteDeclaration,
	TIO extends "input" | "output",
> =
	RouteRequest<E, TIO> extends infer R
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

export type InferClientRequest<E extends RouteDeclaration> = InferRequestFor<
	E,
	"input"
>;

export type InferServerRequest<E extends RouteDeclaration> = InferRequestFor<
	E,
	"output"
>;

type MissingSuccessfulResponseError = {
	readonly __route_error__: "Route must declare at least one successful response.";
};

export type ValidateResponseStatuses<T> = T extends RouteDeclaration
	? T extends { responses: infer TResponses }
		? HasSuccessfulResponse<TResponses> extends false
			? MissingSuccessfulResponseError
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

export type ValidateRequestValueSchemas<T> = T extends RouteDeclaration
	? T extends {
			request: infer TRequest;
		}
		? (TRequest extends { query: infer TQuery extends RequestSchemaRecord }
				? ValidateQueryRecord<TQuery>
				: unknown) &
				(TRequest extends { params: infer TParams extends RequestSchemaRecord }
					? ValidateParamsRecord<TParams>
					: unknown)
		: unknown
	: T extends object
		? {
				[K in keyof T]: ValidateRequestValueSchemas<T[K]>;
			}
		: unknown;

export type ValidateRequestObjectSchemas<T> = T extends RouteDeclaration
	? T extends {
			request: infer TRequest;
		}
		? (TRequest extends { body: infer TBody }
				? ValidateRequestObjectSchema<TBody, "body">
				: unknown) &
				(TRequest extends { params: infer TParams }
					? ValidateRequestObjectSchema<TParams, "params">
					: unknown) &
				(TRequest extends { query: infer TQuery }
					? ValidateRequestObjectSchema<TQuery, "query">
					: unknown)
		: unknown
	: T extends object
		? {
				[K in keyof T]: ValidateRequestObjectSchemas<T[K]>;
			}
		: unknown;
