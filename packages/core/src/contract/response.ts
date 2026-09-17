import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyContentType } from "./body.ts";
import type { RouteDeclaration } from "./routeDeclaration.ts";

export type ResponseSchema = StandardSchemaV1;

export type ResponseBodySchema = ResponseSchema;

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
export type ResponseDeclaration =
	| {
			kind?: never;
			body: ResponseBodySchema;
			contentType: BodyContentType;
			headers?: ResponseHeaders;
	  }
	| {
			kind?: never;
			body: undefined;
			contentType?: never;
			headers?: ResponseHeaders;
	  }
	| {
			kind: "stream";
			body: ResponseBodySchema;
			contentType?: never;
			headers?: ResponseHeaders;
	  };

/** HTTP metadata associated with a declared response schema. */
export type ResponseOptions = {
	contentType?: BodyContentType;
	headers?: ResponseHeaders;
};

export type RouteResponses = Record<number, ResponseDeclaration>;

export type RouteResponseInput =
	| { responses: RouteResponses; response?: never }
	| { response: ResponseDeclaration; responses?: never }
	| { response?: never; responses?: never };

export const getRouteResponses = (route: {
	path: string;
	responses: RouteResponses;
}): RouteResponses => {
	if (Object.keys(route.responses).length === 0) {
		throw new Error(
			`Route declaration at path "${route.path}" must declare at least one response schema.`,
		);
	}

	return route.responses;
};

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type IsStreamResponse<TResponse> = TResponse extends {
	kind: "stream";
}
	? true
	: false;

type InferClientResponseBody<TResponse> =
	ResponseBody<TResponse> extends infer TBody
		? TBody extends StandardSchemaV1
			? IsStreamResponse<TResponse> extends true
				? AsyncIterable<StandardSchemaV1.InferOutput<TBody>>
				: StandardSchemaV1.InferOutput<TBody>
			: TBody extends undefined
				? undefined
				: never
		: never;

export type ServerResponseBody<TResponse> =
	ResponseBody<TResponse> extends infer TBody
		? TBody extends StandardSchemaV1
			? IsStreamResponse<TResponse> extends true
				? AsyncIterable<StandardSchemaV1.InferInput<TBody>>
				: StandardSchemaV1.InferInput<TBody>
			: TBody extends undefined
				? undefined
				: never
		: never;

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
	InferClientResponseBody<TResponse>
> &
	ResponseHeadersMetadata<TResponse, "output"> extends infer TEntry
	? Simplify<TEntry>
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

export type DeclaredClientResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ClientResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
				: never;
		}[keyof TResponses]
	: never;

export type ServerResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ServerResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
				: never;
		}[keyof TResponses]
	: never;

export type SuccessfulDeclaredClientResponse<E extends RouteDeclaration> =
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

type ServerSuccessResponse<E extends RouteDeclaration> = E extends {
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

export type ErrorDeclaredClientResponse<E extends RouteDeclaration> = Exclude<
	DeclaredClientResponse<E>,
	SuccessfulDeclaredClientResponse<E>
>;

export type ServerErrors<E extends RouteDeclaration> = Exclude<
	ServerResponse<E>,
	ServerSuccessResponse<E>
>;
