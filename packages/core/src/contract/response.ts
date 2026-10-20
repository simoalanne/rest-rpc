import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RouteDeclaration } from "./routeDeclaration.ts";
import type { InferSchema, RequestScalar } from "./request.ts";
import type { SseEvent } from "./sse.ts";
import type { Merge } from "../utils/typeUtils.ts";

/**
 * A whole-object schema for response headers whose output contains scalar
 * values. The counterpart of `RequestHeadersSchema`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder}
 */
export type ResponseHeadersSchema = StandardSchemaV1<
	unknown,
	Record<string, RequestScalar | undefined>
>;

/** Response body schemas keyed by base media type. */
export type ResponseContentDeclaration = {
	readonly [mediaType: string]: StandardSchemaV1;
};

/**
 * Canonical declaration for one route response.
 *
 * @remarks A streaming response declares the schema of each item under
 * `text/event-stream`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/serialization}
 */
export type ResponseDeclaration = {
	kind?: "stream";
	content?: ResponseContentDeclaration;
	headers?: ResponseHeadersSchema;
	description?: string;
};

/**
 * HTTP metadata associated with a declared response.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-responses}
 */
export type ResponseOptions = {
	/** HTTP status of the response. Defaults to 200. */
	status?: number;
	headers?: ResponseHeadersSchema;
	/** Describes the response in generated OpenAPI documents. */
	description?: string;
};

export type RouteResponses = Record<number, ResponseDeclaration>;

type IsUnion<T, TAll = T> = T extends unknown
	? [TAll] extends [T]
		? false
		: true
	: never;

type ResponseContent<TResponse> = TResponse extends {
	content: infer TContent;
}
	? TContent
	: never;

// `keyof never` is every key, so bodyless responses are checked first.
type ResponseMediaType<TResponse> = TResponse extends {
	content: infer TContent;
}
	? Extract<keyof TContent, string>
	: never;

type IsStreamResponse<TResponse> = TResponse extends {
	kind: "stream";
}
	? true
	: false;

type ResponseHeadersFor<TResponse> = TResponse extends {
	headers: infer THeaders extends ResponseHeadersSchema;
}
	? THeaders
	: never;

type ResponseHeadersMetadata<TResponse, TIO extends "input" | "output"> = [
	ResponseHeadersFor<TResponse>,
] extends [never]
	? unknown
	: {
			headers: InferSchema<ResponseHeadersFor<TResponse>, TIO>;
		};

type ContentSchema<TResponse, TMediaType> =
	ResponseContent<TResponse> extends infer TContent
		? TMediaType extends keyof TContent
			? Extract<TContent[TMediaType], StandardSchemaV1>
			: never
		: never;

// Handlers produce schema inputs and stream items.
type ServerBody<TResponse, TMediaType> =
	IsStreamResponse<TResponse> extends true
		? AsyncIterable<InferSchema<ContentSchema<TResponse, TMediaType>, "input">>
		: InferSchema<ContentSchema<TResponse, TMediaType>, "input">;

// Clients receive schema outputs and parse every `text/event-stream` response
// as an SSE stream.
type ClientBody<TResponse, TMediaType> =
	IsStreamResponse<TResponse> extends true
		? AsyncIterable<
				SseEvent<InferSchema<ContentSchema<TResponse, TMediaType>, "output">>
			>
		: TMediaType extends "text/event-stream"
			? AsyncIterable<SseEvent<unknown>>
			: InferSchema<ContentSchema<TResponse, TMediaType>, "output">;

// Streams always use `text/event-stream`. A response with several media types
// must select one; a single media type may be omitted.
type ServerContentType<TResponse, TMediaType> =
	IsStreamResponse<TResponse> extends true
		? unknown
		: IsUnion<ResponseMediaType<TResponse>> extends true
			? { contentType: TMediaType }
			: { contentType?: TMediaType };

type ServerResponseEntry<TStatus extends number, TResponse> = [
	ResponseMediaType<TResponse>,
] extends [never]
	? Merge<{ status: TStatus } & ResponseHeadersMetadata<TResponse, "input">>
	: ResponseMediaType<TResponse> extends infer TMediaType
		? TMediaType extends string
			? Merge<
					{
						status: TStatus;
						body: ServerBody<TResponse, TMediaType>;
					} & ServerContentType<TResponse, TMediaType> &
						ResponseHeadersMetadata<TResponse, "input">
				>
			: never
		: never;

// Clients receive every response header; declared headers narrow their keys.
type ClientResponseHeaders<TResponse> = [
	ResponseHeadersFor<TResponse>,
] extends [never]
	? Record<string, string>
	: Record<string, string> &
			InferSchema<ResponseHeadersFor<TResponse>, "output">;

type ClientResponseEntry<TStatus extends number, TResponse> = [
	ResponseMediaType<TResponse>,
] extends [never]
	? {
			status: TStatus;
			contentType: undefined;
			body: undefined;
			headers: ClientResponseHeaders<TResponse>;
		}
	: ResponseMediaType<TResponse> extends infer TMediaType
		? TMediaType extends string
			? {
					status: TStatus;
					contentType: TMediaType;
					body: ClientBody<TResponse, TMediaType>;
					headers: ClientResponseHeaders<TResponse>;
				}
			: never
		: never;

type ResponseKey = number | `${number}`;

type ResponseStatus<TStatus> = TStatus extends number
	? TStatus
	: TStatus extends `${infer TNumber extends number}`
		? TNumber
		: never;

type StatusFilter = "any" | "success" | "error";

type MatchesStatusFilter<
	TStatus extends number,
	TFilter extends StatusFilter,
> = TFilter extends "any"
	? true
	: number extends TStatus
		? true
		: `${TStatus}` extends `2${string}`
			? TFilter extends "success"
				? true
				: false
			: TFilter extends "error"
				? true
				: false;

type ResponseEntryFor<
	TSide extends "client" | "server",
	TStatus extends number,
	TResponse,
> = TSide extends "client"
	? ClientResponseEntry<TStatus, TResponse>
	: ServerResponseEntry<TStatus, TResponse>;

/** Maps each declared status that passes the filter to its response entry. */
type ResponseUnion<
	E extends RouteDeclaration,
	TSide extends "client" | "server",
	TFilter extends StatusFilter,
> = E extends { responses: infer TResponses }
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? MatchesStatusFilter<ResponseStatus<TKeys>, TFilter> extends true
					? ResponseEntryFor<TSide, ResponseStatus<TKeys>, TResponses[TKeys]>
					: never
				: never;
		}[keyof TResponses]
	: never;

export type DeclaredClientResponse<E extends RouteDeclaration> = ResponseUnion<
	E,
	"client",
	"any"
>;

export type ServerResponse<E extends RouteDeclaration> = ResponseUnion<
	E,
	"server",
	"any"
>;

export type SuccessfulDeclaredClientResponse<E extends RouteDeclaration> =
	ResponseUnion<E, "client", "success">;

export type ErrorDeclaredClientResponse<E extends RouteDeclaration> =
	ResponseUnion<E, "client", "error">;
