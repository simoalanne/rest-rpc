import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyContentType } from "./body.ts";
import type { RouteDeclaration } from "./routeDeclaration.ts";
import type { RouteTree } from "./contract.ts";
import type { InferSchema } from "./request.ts";
import type { UsesPlainOutput } from "./routeModes.ts";
import type { SseEvent } from "../sse.ts";
import type { Merge } from "../typeUtils.ts";

/**
 * Declares a whole-object schema for typed response headers.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder}
 */
export type ResponseHeaders = StandardSchemaV1<
	unknown,
	Record<string, string | number | undefined>
>;

/**
 * Canonical declaration for one route response.
 *
 * @see {@link https://rest-rpc.dev/docs/http-behavior/serialization}
 */
export type ResponseDeclaration = {
	kind?: "stream";
	body?: StandardSchemaV1;
	contentType?: BodyContentType;
	headers?: ResponseHeaders;
};

/** HTTP metadata associated with a declared response schema. */
export type ResponseOptions = {
	contentType?: BodyContentType;
	headers?: ResponseHeaders;
};

export type RouteResponses = Record<number, ResponseDeclaration>;

type IsStreamResponse<TResponse> = TResponse extends {
	kind: "stream";
}
	? true
	: false;

// Handlers produce schema inputs; clients receive schema outputs, with stream
// items wrapped in SSE events.
type InferResponseBody<TResponse, TIO extends "input" | "output"> =
	ResponseBody<TResponse> extends infer TBody
		? TBody extends StandardSchemaV1
			? IsStreamResponse<TResponse> extends true
				? AsyncIterable<
						TIO extends "output"
							? SseEvent<InferSchema<TBody, TIO>>
							: InferSchema<TBody, TIO>
					>
				: InferSchema<TBody, TIO>
			: TBody extends undefined
				? undefined
				: never
		: never;

export type ServerResponseBody<TResponse> = InferResponseBody<
	TResponse,
	"input"
>;

type ServerResponseMetadata<TResponse> = TResponse extends {
	contentType: infer TContentType;
}
	? TContentType extends "application/json"
		? unknown
		: TContentType extends readonly string[]
			? { contentType: TContentType[number] }
			: TContentType extends string
				? { contentType?: TContentType }
				: unknown
	: unknown;

type ResponseBody<TResponse> = TResponse extends { body: infer TBody }
	? TBody
	: never;

type ResponseHeadersFor<TResponse> = TResponse extends {
	headers: infer THeaders extends ResponseHeaders;
}
	? THeaders
	: never;

type ResponseHeadersMetadata<TResponse, TIO extends "input" | "output"> = [
	ResponseHeadersFor<TResponse>,
] extends [never]
	? unknown
	: {
			responseHeaders: InferSchema<ResponseHeadersFor<TResponse>, TIO>;
		};

type ResponseEntry<TStatus extends number, TBody> = {
	status: TStatus;
	body: TBody;
};

type ClientResponseEntry<TStatus extends number, TResponse> = ResponseEntry<
	TStatus,
	InferResponseBody<TResponse, "output">
> &
	ResponseHeadersMetadata<TResponse, "output"> extends infer TEntry
	? Merge<TEntry>
	: never;

type ServerResponseBase<TStatus extends number, TBody> = [TBody] extends [
	undefined,
]
	? { status: TStatus }
	: ResponseEntry<TStatus, TBody>;

type ServerResponseEntry<
	TStatus extends number,
	TResponse,
> = ServerResponseBase<TStatus, ServerResponseBody<TResponse>> &
	ServerResponseMetadata<TResponse> &
	ResponseHeadersMetadata<TResponse, "input"> extends infer TEntry
	? Merge<TEntry>
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

export type ProcedureContentType<TContentType> =
	TContentType extends readonly string[] ? TContentType[number] : TContentType;

/** Infers the plain value a procedure handler returns for its 200 response. */
export type ServerProcedureResponse<TResponse> = TResponse extends {
	contentType: infer TContentType;
}
	? TContentType extends "application/json"
		? ServerResponseBody<TResponse>
		: {
				data: ServerResponseBody<TResponse>;
				contentType: ProcedureContentType<TContentType>;
			}
	: ServerResponseBody<TResponse>;

type ServerProcedureOutput<E extends RouteDeclaration> = E extends {
	responses: { 200: infer TResponse };
}
	? ServerProcedureResponse<TResponse>
	: never;

type ServerResponseForRoute<E extends RouteDeclaration> =
	UsesPlainOutput<E> extends true
		? ServerProcedureOutput<E>
		: ServerResponse<E>;

/**
 * Infers the output returned by a route handler.
 *
 * @remarks Response schemas contribute their input types because handlers
 * produce values before response validation and transformation. Pass a route
 * tree to infer a matching tree of response types.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-server-response}
 */
export type InferServerResponse<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? ServerResponseForRoute<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferServerResponse<T[K]>
				: never;
		};
