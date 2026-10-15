import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type { SseServerEvent } from "./sse.ts";
import type { Merge } from "@rest-rpc/core/utils";

/**
 * HTTP response shape from which a handler-based route infers its contract.
 *
 * @remarks An `AsyncIterable` body always denotes an SSE stream. Providing
 * `contentType` selects a custom-content response for non-stream bodies;
 * otherwise bodies use JSON.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#return-responses}
 */
export type ImplicitResponseEnvelope =
	| {
			status: number;
			body?: never;
			contentType?: string;
			headers?: Record<string, string | number | undefined>;
	  }
	| {
			status: number;
			body: unknown;
			contentType?: string;
			headers?: Record<string, string | number | undefined>;
	  };

type BodyResponseKind<TResponse, TBody> =
	TBody extends AsyncIterable<unknown>
		? "stream"
		: TResponse extends { contentType: string }
			? "custom"
			: "json";

/**
 * Infers the body encoding selected by a handler response shape.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#return-responses}
 */
export type ImplicitResponseKind<TResponse> = TResponse extends unknown
	? "body" extends keyof TResponse
		? TResponse extends { body: infer TBody }
			? BodyResponseKind<TResponse, TBody>
			: "empty"
		: "empty"
	: never;

type InferredSchema<TInput, TOutput = TInput> = StandardSchemaV1<
	TInput,
	TOutput
>;

type SerializedResponseHeader<TValue> = TValue extends string
	? TValue
	: TValue extends number
		? `${TValue}`
		: TValue extends undefined
			? undefined
			: never;

type SerializedResponseHeaders<THeaders> = {
	[TKey in keyof THeaders]: SerializedResponseHeader<THeaders[TKey]>;
};

type SseData<T> = T extends SseServerEvent<infer TData> ? TData : T;

type ImplicitResponseBodyDeclaration<TResponse> = TResponse extends {
	body: infer TBody;
}
	? TBody extends AsyncIterable<infer TItem>
		? InferredSchema<TItem, SseData<TItem>>
		: InferredSchema<TBody>
	: undefined;

type ImplicitResponseContentType<TResponse> = TResponse extends {
	body: infer TBody;
}
	? TBody extends AsyncIterable<unknown>
		? never
		: TResponse extends { contentType: infer TContentType extends string }
			? TContentType
			: "application/json"
	: never;

type ImplicitResponseDeclaration<TResponse> = TResponse extends {
	body: unknown;
}
	? {
			body: ImplicitResponseBodyDeclaration<TResponse>;
		} & (TResponse extends { body: AsyncIterable<unknown> }
			? { kind: "stream" }
			: { contentType: ImplicitResponseContentType<TResponse> }) &
			(TResponse extends { headers: infer THeaders }
				? {
						headers: InferredSchema<
							THeaders,
							SerializedResponseHeaders<THeaders>
						>;
					}
				: unknown)
	: { body: undefined } & (TResponse extends {
			headers: infer THeaders;
		}
			? {
					headers: InferredSchema<
						THeaders,
						SerializedResponseHeaders<THeaders>
					>;
				}
			: unknown);

type ResponseStatuses<TResponse> = TResponse extends {
	status: infer TStatus extends number;
}
	? TStatus
	: never;

type InferredResponses<TResponse> = {
	[TStatus in ResponseStatuses<TResponse>]: Merge<
		ImplicitResponseDeclaration<Extract<TResponse, { status: TStatus }>>
	>;
};

type EnvelopeKey = "status" | "body" | "contentType" | "headers";

// TypeScript adds optional `undefined` envelope keys to plain object members
// returned next to envelopes; they are not part of the body.
type WithoutNormalizedEnvelopeKeys<T> = [
	Extract<keyof T, EnvelopeKey>,
] extends [never]
	? T
	: {
			[
				TKey in keyof T as TKey extends EnvelopeKey
					? [T[TKey]] extends [undefined]
						? {} extends Pick<T, TKey>
							? never
							: TKey
						: TKey
					: TKey
			]: T[TKey];
		};

// A member with a numeric status is an envelope; any other value is the 200 body.
type ResponseEnvelopeOf<TResult> = TResult extends { status: number }
	? TResult
	: { status: 200; body: WithoutNormalizedEnvelopeKeys<TResult> };

export type ValidImplicitResult<TResult> = [Awaited<TResult>] extends [never]
	? never
	: [Extract<Awaited<TResult>, { status: number }>] extends [never]
		? unknown
		: Extract<
					Awaited<TResult>,
					{ status: number }
			  > extends ImplicitResponseEnvelope
			? unknown
			: never;

export type InferredRoute<TRoute, TResult> = Merge<
	Omit<TRoute, "responses"> & {
		responses: InferredResponses<ResponseEnvelopeOf<Awaited<TResult>>>;
	}
>;
