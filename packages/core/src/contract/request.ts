import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { CustomBody, FormBody, NoBody } from "./body.ts";
import { isCustomBody, isFormBody, isNoBody } from "./body.ts";
import type { RouteDeclaration } from "./contract.ts";
import type { InferCustomBody } from "./response.ts";
import type { WebSocketMessages } from "./websocketMessages.ts";

export type RequestSegment = "body" | "query" | "pathParams" | "headers";
export type RequestKeys = Record<string, RequestSegment>;
export const REQUEST_CONTEXT_KEY = "context";

export type RequestSchemaRecord = Record<string, StandardSchemaV1>;

/**
 * Declares a query string field that carries a JSON-encoded object value.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query}
 */
export type JsonQuery<TSchema extends StandardSchemaV1 = StandardSchemaV1> = {
	kind: "jsonQuery";
	schema: TSchema;
};

/**
 * Wraps a schema as a JSON query declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query}
 */
export function jsonQuery<const TSchema extends StandardSchemaV1>(
	schema: TSchema,
): JsonQuery<TSchema> {
	return {
		kind: "jsonQuery",
		schema,
	};
}

export function isJsonQuery(schema: unknown): schema is JsonQuery {
	return (
		typeof schema === "object" &&
		schema !== null &&
		"kind" in schema &&
		schema.kind === "jsonQuery"
	);
}

export type RequestBodySchema =
	| StandardSchemaV1
	| RequestSchemaRecord
	| CustomBody
	| FormBody
	| NoBody
	| undefined;

export const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
	typeof value === "object" && value !== null && "~standard" in value;

export const isRequestSchemaRecord = (
	value: unknown,
): value is RequestSchemaRecord =>
	typeof value === "object" &&
	value !== null &&
	!isStandardSchema(value) &&
	!isJsonQuery(value) &&
	!isCustomBody(value) &&
	!isFormBody(value) &&
	!isNoBody(value);

type InferRequestBody<
	TBody,
	TIO extends "input" | "output",
> = TBody extends NoBody
	? never
	: TBody extends CustomBody
		? {
				body: InferCustomBody<TBody, TIO>;
			}
		: TBody extends FormBody<infer TSchema>
			? {
					body: TIO extends "input"
						? StandardSchemaV1.InferInput<TSchema>
						: StandardSchemaV1.InferOutput<TSchema>;
				}
			: TBody extends StandardSchemaV1
				? TIO extends "input"
					? StandardSchemaV1.InferInput<TBody>
					: StandardSchemaV1.InferOutput<TBody>
				: TBody extends RequestSchemaRecord
					? InferRequestSchemaRecord<TBody, TIO>
					: never;

type InferGroupedRequestBody<
	TBody,
	TIO extends "input" | "output",
> = TBody extends NoBody
	? never
	: TBody extends CustomBody
		? InferCustomBody<TBody, TIO>
		: TBody extends FormBody<infer TSchema>
			? TIO extends "input"
				? StandardSchemaV1.InferInput<TSchema>
				: StandardSchemaV1.InferOutput<TSchema>
			: TBody extends StandardSchemaV1
				? TIO extends "input"
					? StandardSchemaV1.InferInput<TBody>
					: StandardSchemaV1.InferOutput<TBody>
				: TBody extends RequestSchemaRecord
					? InferRequestSchemaRecord<TBody, TIO>
					: never;

type InferJsonQuery<TQuery, TIO extends "input" | "output"> =
	TQuery extends JsonQuery<infer TSchema>
		? {
				query: TIO extends "input"
					? StandardSchemaV1.InferInput<TSchema>
					: StandardSchemaV1.InferOutput<TSchema>;
			}
		: never;

type InferGroupedJsonQuery<TQuery, TIO extends "input" | "output"> =
	TQuery extends JsonQuery<infer TSchema>
		? TIO extends "input"
			? StandardSchemaV1.InferInput<TSchema>
			: StandardSchemaV1.InferOutput<TSchema>
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
> = TSegment extends JsonQuery
	? InferJsonQuery<TSegment, TIO>
	: TSegment extends StandardSchemaV1
		? TIO extends "input"
			? StandardSchemaV1.InferInput<TSegment>
			: StandardSchemaV1.InferOutput<TSegment>
		: TSegment extends RequestSchemaRecord
			? InferRequestSchemaRecord<TSegment, TIO>
			: never;

type InferGroupedRequestObjectSegment<
	TSegment,
	TIO extends "input" | "output",
> = TSegment extends JsonQuery
	? InferGroupedJsonQuery<TSegment, TIO>
	: InferRequestObjectSegment<TSegment, TIO>;

type InferRequestSegments<R, TIO extends "input" | "output"> = {
	body: R extends { body: infer TBody } ? InferRequestBody<TBody, TIO> : never;
	query: R extends { query: infer TQuery }
		? InferRequestObjectSegment<TQuery, TIO>
		: never;
	pathParams: R extends { pathParams: infer TPathParams }
		? InferRequestObjectSegment<TPathParams, TIO>
		: never;
	headers: R extends { headers: infer THeaders }
		? THeaders extends RequestSchemaRecord
			? InferRequestSchemaRecord<THeaders, TIO>
			: never
		: never;
};

type InferGroupedRequestSegments<R, TIO extends "input" | "output"> = {
	body: R extends { body: infer TBody }
		? InferGroupedRequestBody<TBody, TIO>
		: never;
	query: R extends { query: infer TQuery }
		? InferGroupedRequestObjectSegment<TQuery, TIO>
		: never;
	pathParams: R extends { pathParams: infer TPathParams }
		? InferGroupedRequestObjectSegment<TPathParams, TIO>
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
> = E extends { flattenRequestKeys: false }
	? InferGroupedRequestSegments<E, TIO>
	: InferRequestSegments<E, TIO>;

type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;
type EmptyObject = Record<never, never>;
type MergeSegment<T> = [T] extends [never] ? unknown : T;
type HasRequestInput<TRequest> = [
	TRequest extends {
		body: infer TBody;
		query: infer TQuery;
		pathParams: infer TPathParams;
		headers: infer THeaders;
	}
		? TBody | TQuery | TPathParams | THeaders
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
				pathParams: infer P;
				headers: infer H;
			}
			? HasRequestInput<R> extends true
				? E extends { flattenRequestKeys: false }
					? Merge<
							([B] extends [never] ? EmptyObject : { body: B }) &
								([Q] extends [never] ? EmptyObject : { query: Q }) &
								([P] extends [never] ? EmptyObject : { pathParams: P }) &
								([H] extends [never] ? EmptyObject : { headers: H })
						>
					: Merge<
							MergeSegment<B> &
								MergeSegment<Q> &
								MergeSegment<P> &
								MergeSegment<H>
						>
				: never
			: never
		: never;

type OptionalRequestKeys<T, TOptionalKeys extends PropertyKey> = [T] extends [
	never,
]
	? never
	: Merge<
			Omit<T, Extract<keyof T, TOptionalKeys>> &
				Partial<Pick<T, Extract<keyof T, TOptionalKeys>>>
		>;

/**
 * Infers the request type passed to a generated client route call.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ClientRequest<
	E extends RouteDeclaration,
	TOptionalKeys extends PropertyKey = never,
> = OptionalRequestKeys<InferRequestFor<E, "input">, TOptionalKeys>;

export type ServerRequest<E extends RouteDeclaration> = InferRequestFor<
	E,
	"output"
>;

export type IsWebSocketRoute<E extends RouteDeclaration> = E extends {
	mode: "webSocket";
}
	? true
	: false;

type InferDiscriminatedWebSocketMessage<
	TDeclaration extends WebSocketMessages,
	TIO extends "input" | "output",
> =
	TDeclaration extends WebSocketMessages<infer TDiscriminator, infer TSchemas>
		? {
				[TKey in keyof TSchemas & string]: {
					[TDiscriminatorKey in TDiscriminator]: TKey;
				} & {
					message: TIO extends "input"
						? StandardSchemaV1.InferInput<TSchemas[TKey]>
						: StandardSchemaV1.InferOutput<TSchemas[TKey]>;
				};
			}[keyof TSchemas & string]
		: never;

type InferWebSocketMessage<
	TMessage,
	TIO extends "input" | "output",
> = TMessage extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<TMessage>
		: StandardSchemaV1.InferOutput<TMessage>
	: TMessage extends WebSocketMessages
		? InferDiscriminatedWebSocketMessage<TMessage, TIO>
		: never;

/**
 * Infers the message type a client can send on a WebSocket route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ClientSent<E extends RouteDeclaration> = E extends {
	messages: { client: infer R };
}
	? InferWebSocketMessage<R, "input">
	: never;

export type ServerReceived<E extends RouteDeclaration> = E extends {
	messages: { client: infer R };
}
	? InferWebSocketMessage<R, "output">
	: never;

export type ServerSent<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? InferWebSocketMessage<R, "input">
	: never;

/**
 * Infers the message type a client receives from a WebSocket route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ClientReceived<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? InferWebSocketMessage<R, "output">
	: never;
