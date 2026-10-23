import type {
	RequestScalar,
	RouteDeclaration,
	ServerRequest,
	ServerResponse,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type { SseServerEvent } from "../pipeline/sse.ts";
import type { Context, DefaultContext } from "./context.ts";
import type {
	EmptyObject,
	IsUnion,
	MaybePromise,
	Merge,
} from "@rest-rpc/core/utils";

/**
 * HTTP response shape from which a handler-based route infers its contract.
 *
 * @remarks An `AsyncIterable` body always denotes an SSE stream. Providing
 * `contentType` selects a custom-content response for non-stream bodies;
 * otherwise bodies use JSON.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#return-responses}
 */
export type ImplicitResponseEnvelope =
	| {
			status: number;
			body?: never;
			contentType?: string;
			headers?: Record<string, RequestScalar | undefined>;
	  }
	| {
			status: number;
			body: unknown;
			contentType?: string;
			headers?: Record<string, RequestScalar | undefined>;
	  };

type InferredSchema<TInput, TOutput = TInput> = StandardSchemaV1<
	TInput,
	TOutput
>;

type SseData<T> = T extends SseServerEvent<infer TData> ? TData : T;

// Async iterables without a content type are SSE streams; other bodies without
// one are JSON.
type ImplicitContentType<TResponse> = TResponse extends {
	contentType: infer TContentType extends string;
}
	? TContentType
	: TResponse extends { body: AsyncIterable<unknown> }
		? "text/event-stream"
		: "application/json";

// The bodies of the envelopes returned with one media type.
type ImplicitBody<TResponse, TMediaType> = TResponse extends {
	body: infer TBody;
}
	? ImplicitContentType<TResponse> extends TMediaType
		? TBody
		: never
	: never;

type ImplicitStreamSchema<TBody> =
	TBody extends AsyncIterable<infer TItem>
		? InferredSchema<TItem, SseData<TItem>>
		: never;

// A `text/event-stream` schema describes stream items.
type ImplicitBodySchema<TResponse, TMediaType> =
	TMediaType extends "text/event-stream"
		? ImplicitStreamSchema<ImplicitBody<TResponse, TMediaType>>
		: InferredSchema<ImplicitBody<TResponse, TMediaType>>;

type ImplicitResponseContent<TResponse> = [
	Extract<TResponse, { body: unknown }>,
] extends [never]
	? unknown
	: {
			content: {
				[
					TMediaType in ImplicitContentType<
						Extract<TResponse, { body: unknown }>
					>
				]: ImplicitBodySchema<TResponse, TMediaType>;
			};
		};

type ImplicitResponseHeaders<TResponse> = TResponse extends {
	headers: infer THeaders;
}
	? THeaders
	: never;

// Groups every envelope returned with one status into one declaration.
type ImplicitResponseDeclaration<TResponse> =
	ImplicitResponseContent<TResponse> &
		([ImplicitResponseHeaders<TResponse>] extends [never]
			? unknown
			: { headers: InferredSchema<ImplicitResponseHeaders<TResponse>> });

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

// rest-rpc frames SSE itself, so `text/event-stream` bodies must be streams.
type ValidStreamEnvelopes<TEnvelope> =
	Extract<TEnvelope, { contentType: "text/event-stream" }> extends {
		body: AsyncIterable<unknown>;
	}
		? unknown
		: never;

type NonSuccessStatus<TEnvelope> = TEnvelope extends {
	status: infer TStatus extends number;
}
	? number extends TStatus
		? never
		: `${TStatus}` extends `2${string}`
			? never
			: TStatus
	: never;

// Errors are thrown, so inferred statuses are successful.
type SuccessStatuses<TEnvelope> = [NonSuccessStatus<TEnvelope>] extends [never]
	? unknown
	: never;

export type ValidImplicitResult<TResult> = [Awaited<TResult>] extends [never]
	? never
	: [Extract<Awaited<TResult>, { status: number }>] extends [never]
		? unknown
		: Extract<
					Awaited<TResult>,
					{ status: number }
			  > extends ImplicitResponseEnvelope
			? ValidStreamEnvelopes<Extract<Awaited<TResult>, { status: number }>> &
					SuccessStatuses<Extract<Awaited<TResult>, { status: number }>>
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

/** Runtime declaration of a server route, including its handler and middleware. */
export type ServerRouteBuilderState = Partial<RouteDeclaration> & {
	readonly handler?: unknown;
	readonly middleware?: readonly RuntimeRouteHandler[];
};

type WithSseItems<T> =
	T extends AsyncIterable<infer TItem>
		? AsyncIterable<TItem | SseServerEvent<TItem>>
		: T;

type WithSseServerEvents<T> = T extends {
	body: AsyncIterable<unknown>;
}
	? Omit<T, "body"> & { body: WithSseItems<T["body"]> }
	: T;

// Handlers may return the body of a route's only declared response directly,
// unless that response has several media types to select from.
type PlainResponseBody<TRoute extends RouteDeclaration> = [
	IsUnion<keyof TRoute["responses"]>,
] extends [false]
	? ServerResponse<TRoute> extends infer TResponse
		? [IsUnion<TResponse>] extends [false]
			? TResponse extends { body: infer TBody }
				? WithSseItems<TBody>
				: never
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
	/**
	 * The request body media type. Routes with a body narrow it to the declared
	 * media types, and routes without one never receive it.
	 */
	contentType?: string;
};

// Routes without a body schema have no request media type.
type BodylessFields<TRoute extends RouteDeclaration> = TRoute extends {
	request: { body: object };
}
	? EmptyObject
	: { contentType?: undefined };

type ErrorsOf<TRoute extends RouteDeclaration> = TRoute extends {
	errors: infer TErrors;
}
	? TErrors
	: EmptyObject;

/**
 * Infers the validated request, handler fields, application context, and
 * declared error classes received by a handler.
 */
export type RouteRequest<
	TRoute extends RouteDeclaration,
	TContext extends object = EmptyObject,
> = Merge<
	ServerRequest<TRoute> &
		HandlerFields &
		BodylessFields<TRoute> & {
			route: TRoute;
			context: Context<TContext>;
			errors: ErrorsOf<TRoute>;
		}
>;

/**
 * Infers the complete handler signature for a route declaration.
 */
export type RouteHandler<
	TRoute extends RouteDeclaration,
	TContext extends object = EmptyObject,
> = (
	...args: [request: RouteRequest<TRoute, TContext>]
) => HandlerResult<TRoute>;

/**
 * A route, a nested object of routes, or a contract implementer tree, whose
 * `$context()` and `use()` methods are ignored.
 */
export type HandlerTree =
	| { readonly "~restrpc": RouteDeclaration }
	| { readonly [key: string]: HandlerTree | ((...args: never) => unknown) };

// Server routes and implementer leaves carry their selected context as a
// type-only declaration field. Contract routes do not, because the context is
// selected when they are implemented.
export type ContextOf<TRoute> = TRoute extends {
	readonly context?: infer TContext extends object;
}
	? TContext
	: DefaultContext;

type WithoutContext<TRoute extends RouteDeclaration> =
	"context" extends keyof TRoute
		? Extract<Omit<TRoute, "context">, RouteDeclaration>
		: TRoute;

/**
 * Infers the handler signature for a route declaration.
 *
 * @remarks Use a route declared without `.handler()` to write its handler
 * separately. Pass a route tree or a contract implementer to infer a matching
 * tree of handler types. The context is the one selected with `$context()`, or
 * `DefaultContext` for contract routes passed directly.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#type-helpers}
 */
export type InferServerHandler<T extends HandlerTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? RouteHandler<WithoutContext<TRoute>, ContextOf<TRoute>>
	: {
			[
				K in keyof T as T[K] extends HandlerTree ? K : never
			]: InferServerHandler<Extract<T[K], HandlerTree>>;
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

type HandlerRequests<T> = T extends (...args: never) => unknown
	? Parameters<T>[0]
	: { [K in keyof T]: HandlerRequests<T[K]> };

type HandlerResponses<T> = T extends (...args: never) => unknown
	? Awaited<ReturnType<T>>
	: { [K in keyof T]: HandlerResponses<T[K]> };

/**
 * Infers the request a handler receives, including context and `signal`.
 *
 * @remarks The first parameter of {@link InferServerHandler}. Pass a route
 * tree to infer a matching tree of request types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#type-helpers}
 */
export type InferServerRequest<TRoute extends HandlerTree> = HandlerRequests<
	InferServerHandler<TRoute>
>;

/**
 * Infers the result a handler may return.
 *
 * @remarks The awaited return type of {@link InferServerHandler}. Pass a route
 * tree to infer a matching tree of response types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#type-helpers}
 */
export type InferServerResponse<TRoute extends HandlerTree> = HandlerResponses<
	InferServerHandler<TRoute>
>;

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
	errors: Readonly<Record<string, unknown>>;
};

export type RequestFields = Partial<UnknownRequest>;

/**
 * Validated declaration-position request data, handler fields, context, and controls for inline middleware.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/middleware}
 */
export type MiddlewareRequest<
	TRoute extends RouteDeclaration,
	TContext extends object,
> = RouteRequest<TRoute, TContext> & UnknownRequest & Controls;

/**
 * Handler fields, global context, unknown request locations, and controls for reusable middleware.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/middleware}
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
