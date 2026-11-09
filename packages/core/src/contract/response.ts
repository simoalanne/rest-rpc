import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RouteDefinition } from "./routeDefinition.ts";
import type { InferSchema, RequestScalar } from "./request.ts";
import type { SseEvent } from "./sse.ts";
import type { RouteError } from "./routeError.ts";
import type { IsUnion, Merge } from "../utils/typeUtils.ts";

/** A whole-object schema for response headers whose output contains scalar values. */
export type ResponseHeadersSchema = StandardSchemaV1<
	unknown,
	Record<string, RequestScalar | undefined>
>;

/** Response body schemas keyed by base media type. */
export type ResponseContentDefinition = {
	readonly [mediaType: string]: StandardSchemaV1;
};

/** A `text/event-stream` entry is always an SSE stream whose schema validates each item. */
export type ResponseDefinition = {
	content?: ResponseContentDefinition;
	headers?: ResponseHeadersSchema;
	description?: string;
};

/**
 * HTTP metadata associated with a defined response.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#define-responses}
 */
export type ResponseOptions = {
	/** HTTP status of the response, from 200 to 299. Defaults to 200. */
	status?: number;
	headers?: ResponseHeadersSchema;
	/** Describes the response in generated OpenAPI documents. */
	description?: string;
};

export type RouteResponses = Record<number, ResponseDefinition>;

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

// `text/event-stream` schemas describe stream items. Handlers produce schema
// inputs, and clients receive schema outputs wrapped in SSE events.
type ServerBody<TResponse, TMediaType> = TMediaType extends "text/event-stream"
	? AsyncIterable<InferSchema<ContentSchema<TResponse, TMediaType>, "input">>
	: InferSchema<ContentSchema<TResponse, TMediaType>, "input">;

type ClientBody<TResponse, TMediaType> = TMediaType extends "text/event-stream"
	? AsyncIterable<
			SseEvent<InferSchema<ContentSchema<TResponse, TMediaType>, "output">>
		>
	: InferSchema<ContentSchema<TResponse, TMediaType>, "output">;

// A response with several media types must select one; a single media type
// may be omitted.
type ServerContentType<TResponse, TMediaType> =
	IsUnion<ResponseMediaType<TResponse>> extends true
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

// Clients receive every response header; defined headers narrow their keys.
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

type ResponseEntryFor<
	TSide extends "client" | "server",
	TStatus extends number,
	TResponse,
> = TSide extends "client"
	? ClientResponseEntry<TStatus, TResponse>
	: ServerResponseEntry<TStatus, TResponse>;

/** Maps each defined status to its response entry. */
type ResponseUnion<
	E extends RouteDefinition,
	TSide extends "client" | "server",
> = E extends { responses: infer TResponses }
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ResponseEntryFor<TSide, ResponseStatus<TKeys>, TResponses[TKeys]>
				: never;
		}[keyof TResponses]
	: never;

export type DefinedClientResponse<E extends RouteDefinition> = ResponseUnion<
	E,
	"client"
>;

export type ServerResponse<E extends RouteDefinition> = ResponseUnion<
	E,
	"server"
>;

type ClientErrorHeaders<TDefinition> = TDefinition extends {
	headers: infer THeaders extends ResponseHeadersSchema;
}
	? Record<string, string> & InferSchema<THeaders, "output">
	: Record<string, string>;

type ClientErrorData<TDefinition> = TDefinition extends {
	data: infer TData extends StandardSchemaV1;
}
	? InferSchema<TData, "output">
	: undefined;

// The top-level conditional keeps editors from displaying this alias instead of the resolved union.
export type ClientRouteError<E extends RouteDefinition> = E extends {
	errors: infer TErrors;
}
	? {
			[TCode in Extract<keyof TErrors, string>]: TErrors[TCode] extends {
				status: infer TStatus extends number;
			}
				? RouteError<
						TCode,
						ClientErrorData<TErrors[TCode]>,
						TStatus,
						ClientErrorHeaders<TErrors[TCode]>
					>
				: never;
		}[Extract<keyof TErrors, string>]
	: never;
