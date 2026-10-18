import type {
	InferServerRequest,
	RouteDeclaration,
	RouteTree,
	ServerResponse,
	ServerResponseBody,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type { SseServerEvent } from "../pipeline/sse.ts";
import type { Context } from "./context.ts";
import type { EmptyObject, MaybePromise, Merge } from "@rest-rpc/core/utils";

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

/** Untyped route handler stored in a completed runtime route declaration. */
export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;

type WithSseItems<T> =
	T extends AsyncIterable<infer TItem>
		? AsyncIterable<TItem | SseServerEvent<TItem>>
		: T;

type WithSseServerEvents<T> = T extends {
	body: AsyncIterable<unknown>;
}
	? Omit<T, "body"> & { body: WithSseItems<T["body"]> }
	: T;

type IsUnion<T, TAll = T> = T extends unknown
	? [TAll] extends [T]
		? false
		: true
	: never;

// Handlers may return the body of a route's only declared response directly,
// unless its content type must be selected from a list.
type PlainResponseBody<TRoute extends RouteDeclaration> = [
	IsUnion<keyof TRoute["responses"]>,
] extends [false]
	? TRoute["responses"][keyof TRoute["responses"]] extends infer TResponse
		? TResponse extends { contentType: readonly string[] }
			? never
			: TResponse extends { body: StandardSchemaV1 }
				? WithSseItems<ServerResponseBody<TResponse>>
				: never
		: never
	: never;

type HandlerResult<TRoute extends RouteDeclaration> = MaybePromise<
	WithSseServerEvents<ServerResponse<TRoute>> | PlainResponseBody<TRoute>
>;

/** Request fields every handler and middleware receives besides the validated request. */
type HandlerFields = {
	/** Aborts when the client disconnects. */
	signal: AbortSignal;
	/** The received request media type, if any. */
	contentType?: string;
	/** The `Last-Event-ID` request header, used to resume streams. */
	lastEventId?: string;
};

/**
 * Infers the validated request, handler fields, and application context
 * received by a handler.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteRequest<
	TRoute extends RouteDeclaration,
	TContext extends object = EmptyObject,
> = Merge<
	InferServerRequest<{ readonly "~restrpc": TRoute }> &
		HandlerFields & {
			route: TRoute;
			context: Context<TContext>;
		}
>;

/**
 * Infers the complete handler signature for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteHandler<
	TRoute extends RouteDeclaration,
	TContext extends object = EmptyObject,
> = (
	...args: [request: RouteRequest<TRoute, TContext>]
) => HandlerResult<TRoute>;

/**
 * Infers handler signatures for a route or a nested object tree of routes.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteHandlerFor<
	T extends RouteTree,
	TContext extends object = EmptyObject,
> = T extends { readonly "~restrpc": infer TRoute extends RouteDeclaration }
	? RouteHandler<TRoute, TContext>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? RouteHandlerFor<T[K], TContext>
				: never;
		};

export type HasDeclaredResponses<TRoute> = TRoute extends {
	responses: infer TResponses;
}
	? keyof TResponses extends never
		? false
		: true
	: false;

/**
 * Results a handler may return. Routes with declared responses must return one
 * of them; other routes infer their responses from any valid result.
 */
export type AllowedHandlerResult<
	TRoute extends RouteDeclaration,
	TContext extends object,
> =
	HasDeclaredResponses<TRoute> extends true
		? ReturnType<RouteHandler<TRoute, TContext>>
		: unknown;

/** Rejects invalid implicit response envelopes. */
export type ValidHandlerResult<TRoute extends RouteDeclaration, TResult> =
	HasDeclaredResponses<TRoute> extends true
		? unknown
		: ValidImplicitResult<TResult>;

/** Unchecked application output returned by middleware. */
export type MiddlewareReturn = unknown;

type Controls = {
	next(): Promise<unknown>;
};

type UnknownRequest = {
	params: unknown;
	headers: unknown;
	body: unknown;
	query: unknown;
};

export type RequestFields = Partial<UnknownRequest>;

/**
 * Validated declaration-position request data, handler fields, context, and controls for inline middleware.
 *
 * @see {@link https://rest-rpc.dev/docs/middleware}
 */
export type MiddlewareRequest<
	TRoute extends RouteDeclaration,
	TContext extends object,
> = RouteRequest<TRoute, TContext> & UnknownRequest & Controls;

/**
 * Handler fields, global context, unknown request locations, and controls for reusable middleware.
 *
 * @see {@link https://rest-rpc.dev/docs/middleware}
 */
export type ReusableMiddlewareRequest<
	TRequest extends RequestFields,
	TContext extends object,
> = HandlerFields &
	TRequest &
	UnknownRequest & {
		route: RouteDeclaration;
		context: Context<TContext>;
	} & Controls;
