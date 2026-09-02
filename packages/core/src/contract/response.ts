import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { CustomBody, CustomResponseBody, NoBody, Stream } from "./body.ts";
import type { BaseRouteDeclaration } from "./baseRouteDeclaration.ts";

export type ResponseSchema = StandardSchemaV1;

export type ResponseBodySchema =
	| ResponseSchema
	| NoBody
	| CustomResponseBody
	| Stream;

/**
 * Declares a whole-object schema for typed response headers.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-typed-headers}
 */
export type ResponseHeaders = StandardSchemaV1<
	unknown,
	Record<string, string | number | undefined>
>;

/** Declares a standard-schema response body with optional typed headers. */
export type RegularResponseDeclaration =
	| ResponseSchema
	| {
			body: ResponseSchema;
			headers: ResponseHeaders;
	  };

/**
 * Declares a route response body, or a body plus typed response headers.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses}
 */
export type ResponseDeclaration =
	| ResponseBodySchema
	| {
			body: ResponseBodySchema;
			headers: ResponseHeaders;
	  };

export type RouteResponses = Record<number, ResponseDeclaration>;

export type RouteResponseInput =
	| { responses: RouteResponses; response?: never }
	| { response: ResponseDeclaration; responses?: never }
	| { response?: never; responses?: never };

export const hasResponseParts = (
	response: ResponseDeclaration,
): response is Extract<ResponseDeclaration, { body: ResponseBodySchema }> =>
	typeof response === "object" && response !== null && "headers" in response;

export const getResponseBody = (
	response: ResponseDeclaration,
): ResponseBodySchema =>
	hasResponseParts(response) ? response.body : response;

export const getResponseHeaders = (
	response: ResponseDeclaration,
): ResponseHeaders | undefined =>
	hasResponseParts(response) ? response.headers : undefined;

export const getRouteResponses = (route: {
	path: string;
	responses?: RouteResponses;
}): RouteResponses => {
	if (route.responses === undefined) {
		throw new Error(
			`Route declaration at path "${route.path}" is missing responses.`,
		);
	}

	if (Object.keys(route.responses).length === 0) {
		throw new Error(
			`Route declaration at path "${route.path}" must declare at least one response schema.`,
		);
	}

	return route.responses;
};

type InferCustomBodyPayload<
	TSchema,
	TIO extends "input" | "output",
> = TSchema extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<TSchema>
		: StandardSchemaV1.InferOutput<TSchema>
	: never;

export type InferCustomBody<TResponse, TIO extends "input" | "output"> =
	TResponse extends CustomBody<infer TSchema, infer TContentType>
		? TContentType extends readonly string[]
			? {
					contentType: TContentType[number];
					payload: InferCustomBodyPayload<TSchema, TIO>;
				}
			: InferCustomBodyPayload<TSchema, TIO>
		: never;

type InferCustomStreamBody<TBody, TIO extends "input" | "output"> =
	TBody extends CustomBody<infer TSchema, infer TContentType>
		? TContentType extends readonly string[]
			? {
					contentType: TContentType[number];
					payload: AsyncIterable<InferCustomBodyPayload<TSchema, TIO>>;
				}
			: AsyncIterable<InferCustomBodyPayload<TSchema, TIO>>
		: never;

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type InferClientResponseBody<TResponse> = TResponse extends StandardSchemaV1
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

export type ServerResponseBody<TResponse> = TResponse extends StandardSchemaV1
	? StandardSchemaV1.InferInput<TResponse>
	: TResponse extends NoBody
		? undefined
		: TResponse extends CustomBody
			? InferCustomBody<TResponse, "input">
			: TResponse extends Stream<infer TBody>
				? TBody extends CustomBody
					? InferCustomStreamBody<TBody, "input">
					: TBody extends StandardSchemaV1
						? AsyncIterable<StandardSchemaV1.InferInput<TBody>>
						: never
				: never;

type CustomBodyClientResponseMetadata<TBody> =
	TBody extends CustomBody<StandardSchemaV1, infer TContentType>
		? TContentType extends readonly string[]
			? { contentType: TContentType[number] }
			: TContentType extends string
				? { contentType: TContentType }
				: unknown
		: unknown;

type ClientResponseMetadata<TResponse> =
	TResponse extends Stream<infer TBody>
		? CustomBodyClientResponseMetadata<TBody>
		: CustomBodyClientResponseMetadata<TResponse>;

type ResponseBody<TResponse> = TResponse extends { headers: ResponseHeaders }
	? TResponse extends { body: infer TBody }
		? TBody
		: TResponse
	: TResponse;

type ResponseHeadersFor<TResponse> = TResponse extends {
	headers: infer THeaders extends ResponseHeaders;
}
	? THeaders
	: never;

type InferResponseHeaders<
	THeaders,
	TIO extends "input" | "output",
> = THeaders extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<THeaders>
		: StandardSchemaV1.InferOutput<THeaders>
	: never;

type ResponseHeadersMetadata<TResponse, TIO extends "input" | "output"> = [
	ResponseHeadersFor<TResponse>,
] extends [never]
	? unknown
	: {
			responseHeaders: InferResponseHeaders<ResponseHeadersFor<TResponse>, TIO>;
		};

type ResponseEntry<TStatus extends number, TBody> = {
	status: TStatus;
	body: TBody;
};

type ClientResponseEntry<TStatus extends number, TResponse> = ResponseEntry<
	TStatus,
	InferClientResponseBody<ResponseBody<TResponse>>
> &
	ClientResponseMetadata<ResponseBody<TResponse>> &
	ResponseHeadersMetadata<TResponse, "output"> extends infer TEntry
	? Simplify<TEntry>
	: never;

type ServerResponseEntry<TStatus extends number, TResponse> = ResponseEntry<
	TStatus,
	ServerResponseBody<ResponseBody<TResponse>>
> &
	ResponseHeadersMetadata<TResponse, "input"> extends infer TEntry
	? Simplify<TEntry>
	: never;

type ResponseKey = number | `${number}`;

type ResponseStatus<TStatus> = TStatus extends number
	? TStatus
	: TStatus extends `${infer TNumber extends number}`
		? TNumber
		: never;

type IsUnion<T, U = T> = [T] extends [never]
	? false
	: T extends unknown
		? [U] extends [T]
			? false
			: true
		: false;

type SuccessfulResponseKeys<TResponses> = {
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

export type DeclaredClientResponse<E extends BaseRouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ClientResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
				: never;
		}[keyof TResponses]
	: never;

export type ServerResponse<E extends BaseRouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ServerResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
				: never;
		}[keyof TResponses]
	: never;

export type SuccessfulDeclaredClientResponse<E extends BaseRouteDeclaration> =
	E extends {
		responses: infer TResponses;
	}
		? {
				[TKeys in keyof TResponses]: TKeys extends ResponseKey
					? TKeys extends SuccessfulResponseKeys<TResponses>
						? ClientResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
						: never
					: never;
			}[keyof TResponses]
		: never;

type ServerSuccessResponse<E extends BaseRouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? TKeys extends SuccessfulResponseKeys<TResponses>
					? ServerResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
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

type InferSingleServerResponseBody<TResponse> = [TResponse] extends [never]
	? never
	: IsUnion<TResponse> extends true
		? never
		: TResponse extends { responseHeaders: unknown }
			? never
			: TResponse extends { body: infer TBody }
				? TBody
				: never;

type SseResponseDeclaration<E extends BaseRouteDeclaration> = E extends {
	responses: { 200: infer TResponse };
}
	? TResponse
	: never;

type InferSseServerResponseBody<E extends BaseRouteDeclaration> = [
	SseResponseDeclaration<E>,
] extends [never]
	? InferSingleServerResponseBody<ServerSuccessResponse<E>>
	: SseResponseDeclaration<E> extends ResponseDeclaration
		? ServerResponseBody<ResponseBody<SseResponseDeclaration<E>>>
		: never;

/**
 * Infers the body returned by `fetch()` for routes with one successful response.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ClientResponseBody<E extends BaseRouteDeclaration> = E extends {
	mode: "sse";
}
	? never
	: InferSingleResponseBody<SuccessfulDeclaredClientResponse<E>>;

export type ServerSuccessBody<E extends BaseRouteDeclaration> = E extends {
	mode: "sse";
}
	? AsyncIterable<InferSseServerResponseBody<E>>
	: InferSingleServerResponseBody<ServerSuccessResponse<E>>;

export type ErrorDeclaredClientResponse<E extends BaseRouteDeclaration> =
	Exclude<DeclaredClientResponse<E>, SuccessfulDeclaredClientResponse<E>>;

export type ServerErrors<E extends BaseRouteDeclaration> = Exclude<
	ServerResponse<E>,
	ServerSuccessResponse<E>
>;
