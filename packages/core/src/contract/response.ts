import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RouteDefinition } from "./routeDefinition.ts";
import type { InferSchema } from "./request.ts";
import type { SseEvent } from "./sse.ts";
import type { ErrorSchemaValue, RouteError } from "./routeError.ts";
import type { Merge } from "../utils/typeUtils.ts";

/** A whole-object schema for response headers, whose output values are sent as strings. */
export type ResponseHeadersSchema = StandardSchemaV1<
	unknown,
	Record<string, unknown>
>;

/**
 * A defined response: a body schema, or an `sse` schema that validates each
 * item of a Server-Sent Event stream. Its content type is a `content-type`
 * header, so a headers schema declares it.
 */
export type ResponseDefinition = {
	body?: StandardSchemaV1;
	sse?: StandardSchemaV1;
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

type BodySchema<TResponse> = TResponse extends {
	body: infer TSchema extends StandardSchemaV1;
}
	? TSchema
	: never;

type SseSchema<TResponse> = TResponse extends {
	sse: infer TSchema extends StandardSchemaV1;
}
	? TSchema
	: never;

// `keyof never` is every key, so bodyless responses are checked first.
type HasBody<TResponse> = [
	BodySchema<TResponse> | SseSchema<TResponse>,
] extends [never]
	? false
	: true;

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

type InferOptional<TSchema, TIO extends "input" | "output"> = [
	TSchema,
] extends [never]
	? never
	: TSchema extends StandardSchemaV1
		? InferSchema<TSchema, TIO>
		: never;

// `sse` schemas describe stream items. Handlers produce schema inputs, and
// clients receive schema outputs wrapped in SSE events.
type ServerBody<TResponse> =
	| InferOptional<BodySchema<TResponse>, "input">
	| ([SseSchema<TResponse>] extends [never]
			? never
			: AsyncIterable<InferOptional<SseSchema<TResponse>, "input">>);

type ClientBody<TResponse> =
	| InferOptional<BodySchema<TResponse>, "output">
	| ([SseSchema<TResponse>] extends [never]
			? never
			: AsyncIterable<SseEvent<InferOptional<SseSchema<TResponse>, "output">>>);

type ServerResponseEntry<TStatus extends number, TResponse> =
	HasBody<TResponse> extends false
		? Merge<{ status: TStatus } & ResponseHeadersMetadata<TResponse, "input">>
		: Merge<
				{
					status: TStatus;
					body: ServerBody<TResponse>;
				} & ResponseHeadersMetadata<TResponse, "input">
			>;

// Clients receive every response header; defined headers narrow their keys.
type ClientResponseHeaders<TResponse> = [
	ResponseHeadersFor<TResponse>,
] extends [never]
	? Record<string, string>
	: Record<string, string> &
			InferSchema<ResponseHeadersFor<TResponse>, "output">;

// The conditional always matches. It keeps editors from displaying this alias
// instead of the resolved object.
type ClientResponseEntry<TStatus extends number, TResponse> = [
	TResponse,
] extends [unknown]
	? {
			status: TStatus;
			body: HasBody<TResponse> extends false
				? undefined
				: ClientBody<TResponse>;
			headers: ClientResponseHeaders<TResponse>;
			/** Received `Set-Cookie` values. Browsers hide them from `fetch`, so it is empty there. */
			cookies: readonly string[];
		}
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

/**
 * Maps each defined status to its response entry. The conditional always
 * matches. It keeps editors and declaration emit from referring to this alias
 * instead of the resolved union.
 */
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
						ErrorSchemaValue<TErrors[TCode], "data", "output", undefined>,
						TStatus,
						Record<string, string> &
							ErrorSchemaValue<TErrors[TCode], "headers", "output", unknown>
					>
				: never;
		}[Extract<keyof TErrors, string>]
	: never;
