import type {
	DefaultMeta,
	LowercaseHeadersOptionCheck,
	PathParamNames,
	RouteDefinition,
	ServerRequest,
	ServerResponse,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type {
	RespondOptions,
	ResponseEnvelope,
	ResponseEnvelopeBase,
	ResponseEnvelopeFields,
} from "../pipeline/respond.ts";
import type { SseServerEvent } from "../pipeline/sse.ts";
import type {
	DefaultContext,
	ExtendContext,
	InjectContext,
} from "./context.ts";
import type {
	EmptyObject,
	IsUnion,
	MaybePromise,
	Merge,
} from "@rest-rpc/core/utils";

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

// Groups every envelope returned with one status into one definition.
type ImplicitResponseDefinition<TResponse> =
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
		ImplicitResponseDefinition<Extract<TResponse, { status: TStatus }>>
	>;
};

// `respond()` results carry their own envelope fields, `undefined` is a
// bodyless 200, and any other value is the 200 body.
type EnvelopeOf<TResult> =
	TResult extends ResponseEnvelope<unknown, object>
		? ResponseEnvelopeFields<TResult>
		: TResult extends undefined | void
			? { status: 200 }
			: { status: 200; body: TResult };

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
	: ValidStreamEnvelopes<EnvelopeOf<Awaited<TResult>>> &
			SuccessStatuses<EnvelopeOf<Awaited<TResult>>>;

export type InferredRoute<TRoute, TResult> = Merge<
	Omit<TRoute, "responses"> & {
		responses: InferredResponses<EnvelopeOf<Awaited<TResult>>>;
	}
>;

export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;

export type ServerRouteBuilderState = Partial<RouteDefinition> & {
	readonly handler?: unknown;
	readonly middleware?: readonly RuntimeRouteHandler[];
	/** Set by `.static()`, whose handler returns the same response for every request. */
	readonly static?: true;
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

type DefinedStatus<TRoute extends RouteDefinition> = Extract<
	keyof TRoute["responses"],
	number
>;

// `respond()` may omit the route's only status, or 200 among several.
type DefaultStatus<TRoute extends RouteDefinition> =
	IsUnion<DefinedStatus<TRoute>> extends true
		? Extract<DefinedStatus<TRoute>, 200>
		: DefinedStatus<TRoute>;

type RespondFor<TRoute extends RouteDefinition, TResponse> = TResponse extends {
	status: infer TStatus extends number;
}
	? ResponseEnvelope<
			TResponse extends { body: infer TBody } ? TBody : undefined,
			Omit<TResponse, "status" | "body"> &
				(TStatus extends DefaultStatus<TRoute>
					? { status?: TStatus }
					: { status: TStatus })
		>
	: never;

// Handlers may return the body of a route's only defined response directly,
// unless that response has several media types to select from.
type PlainResponseBody<TRoute extends RouteDefinition> =
	ServerResponse<TRoute> extends infer TResponse
		? IsUnion<TResponse> extends true
			? never
			: TResponse extends { body: infer TBody }
				? WithSseItems<TBody>
				: undefined | void
		: never;

type HandlerResult<TRoute extends RouteDefinition> = MaybePromise<
	| RespondFor<TRoute, WithSseServerEvents<ServerResponse<TRoute>>>
	| PlainResponseBody<TRoute>
>;

/**
 * The `respond` handlers and middleware receive: `respond()`, with `status`
 * limited to `TStatus`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#return-responses}
 */
export type RouteRespond<TStatus extends number = number> = <
	TBody,
	const TOptions extends Omit<RespondOptions, "status"> & {
		status?: TStatus;
	} = {},
>(
	body: TBody,
	options?: TOptions & LowercaseHeadersOptionCheck<TOptions>,
) => ResponseEnvelope<TBody, NoInfer<TOptions>>;

// Routes with defined responses respond with one of their statuses.
type RespondStatusFor<TRoute extends RouteDefinition> =
	HasDefinedResponses<TRoute> extends true ? DefinedStatus<TRoute> : number;

/** Request fields every handler and middleware receives besides the validated request. */
type HandlerFields = {
	/** Aborts when the client disconnects. */
	signal: AbortSignal;
	/**
	 * The request body media type. Routes with a body narrow it to the defined
	 * media types, and routes without one never receive it.
	 */
	contentType?: string;
};

// Routes without a body schema have no request media type.
type BodylessFields<TRoute extends RouteDefinition> = TRoute extends {
	request: { body: object };
}
	? EmptyObject
	: { contentType?: undefined };

// Handlers and middleware throw `errors.CODE(...)` without `new`.
type ErrorFactories<TErrors> = Merge<{
	[K in keyof TErrors]: TErrors[K] extends abstract new (
		...args: infer TArgs
	) => infer TError
		? (...args: TArgs) => TError
		: TErrors[K];
}>;

type ErrorsOf<TRoute extends RouteDefinition> = TRoute extends {
	errors: infer TErrors;
}
	? ErrorFactories<TErrors>
	: EmptyObject;

export type RouteRequest<
	TRoute extends RouteDefinition,
	TContext extends object = EmptyObject,
> = Merge<
	ServerRequest<TRoute> &
		HandlerFields &
		BodylessFields<TRoute> & {
			route: TRoute;
			context: Merge<Readonly<TContext>>;
			errors: ErrorsOf<TRoute>;
			/** Returns a response with a status, media type, or headers the route defines. */
			respond: RouteRespond<RespondStatusFor<TRoute>>;
		}
>;

export type RouteHandler<
	TRoute extends RouteDefinition,
	TContext extends object = EmptyObject,
> = (
	...args: [request: RouteRequest<TRoute, TContext>]
) => HandlerResult<TRoute>;

/** A route, a route tree, or a contract implementer tree, whose `$context()` and `use()` are ignored. */
export type HandlerTree =
	| { readonly "~restrpc": RouteDefinition }
	| { readonly [key: string]: HandlerTree | ((...args: never) => unknown) };

// Server routes and implementer leaves carry their handler context and the
// initial context the host provides as type-only definition fields. Contract
// routes do not, because the context is selected when they are implemented.
export type ContextOf<TRoute> = TRoute extends {
	readonly context?: infer TContext extends object;
}
	? TContext
	: DefaultContext;

/** The initial context the host must provide for a route. */
export type InitialContextOf<TRoute> = TRoute extends {
	readonly initialContext?: (context: infer TContext extends object) => void;
}
	? TContext
	: DefaultContext;

/**
 * Type-only definition fields of a server route: the context its handler
 * receives, and the initial context the host provides. The initial context is
 * a parameter, so a route tree requires the intersection of its routes'.
 */
export type ContextFields<TInitial extends object, TContext extends object> = {
	readonly context?: TContext;
	readonly initialContext?: (context: TInitial) => void;
};

// The route as handlers receive it: the runtime strips the handler, and the
// context fields exist only in types.
type HandlerRouteOf<TRoute extends RouteDefinition> = Extract<
	Merge<Omit<TRoute, "handler" | "context" | "initialContext">>,
	RouteDefinition
>;

/**
 * Infers the handler signature for a route definition.
 *
 * @remarks Use a route defined without `.handler()` to write its handler
 * separately. Pass a route tree or a contract implementer to infer a matching
 * tree of handler types. The context is the one selected with `$context()`, or
 * `DefaultContext` for contract routes passed directly.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#type-helpers}
 */
export type InferServerHandler<T extends HandlerTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDefinition;
}
	? RouteHandler<HandlerRouteOf<TRoute>, ContextOf<TRoute>>
	: {
			[
				K in keyof T as T[K] extends HandlerTree ? K : never
			]: InferServerHandler<Extract<T[K], HandlerTree>>;
		};

export type HasDefinedResponses<TRoute> = TRoute extends {
	responses: infer TResponses;
}
	? keyof TResponses extends never
		? false
		: true
	: false;

/** Routes with defined responses must return one of them; other routes may return any valid result. */
export type AllowedHandlerResult<
	TRoute extends RouteDefinition,
	TContext extends object,
> =
	HasDefinedResponses<TRoute> extends true
		? ReturnType<RouteHandler<TRoute, TContext>>
		: unknown;

/** Rejects invalid implicit response envelopes. */
export type ValidHandlerResult<TRoute extends RouteDefinition, TResult> =
	HasDefinedResponses<TRoute> extends true
		? unknown
		: ValidImplicitResult<TResult>;

/** Whether a route reads no request input, so `.static()` can complete it. */
export type IsStaticRoute<TRoute> = keyof (TRoute extends {
	request: infer TRequest;
}
	? TRequest
	: EmptyObject) extends never
	? [
			| PathParamNames<TRoute extends { path: infer TPath } ? TPath : never>
			| PathParamNames<
					TRoute extends { prefix: infer TPrefix } ? TPrefix : never
			  >,
		] extends [never]
		? true
		: false
	: false;

type StaticBody<TResult> =
	TResult extends ResponseEnvelopeBase<infer TBody> ? TBody : TResult;

/** Rejects promises, and stream bodies, which can be sent only once. */
export type ValidStaticResult<TRoute extends RouteDefinition, TResult> = [
	| Extract<TResult, PromiseLike<unknown>>
	| Extract<StaticBody<TResult>, AsyncIterable<unknown> | ReadableStream>,
] extends [never]
	? ValidHandlerResult<TRoute, TResult>
	: never;

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

declare const injectedContext: unique symbol;

/**
 * A response middleware may return: the response `next()` resolves to, a
 * `respond()` result, or an object of the same shape, such as a response
 * restored from a cache.
 */
export type MiddlewareResponse = RespondOptions & { readonly body?: unknown };

/**
 * The response `next()` resolves to: the downstream result as a `respond()`
 * envelope with its status set. It carries the context injected with `next()`
 * as a type-only key, so returning it types the context of later middleware
 * and the handler.
 */
export type NextResponse<TInjected extends object> = ResponseEnvelope<
	unknown,
	Omit<RespondOptions, "status"> & { status: number }
> & { readonly [injectedContext]: TInjected };

/** The context a middleware returning `TResponse` injects. */
// The tuple collects the injected context of every member of a union of
// responses, so responses that inject nothing do not add `EmptyObject` to it.
export type InjectedOf<TResponse> = [
	TResponse extends { readonly [injectedContext]: infer TInjected }
		? TInjected
		: never,
] extends [infer TInjected extends object]
	? [TInjected] extends [never]
		? EmptyObject
		: TInjected
	: EmptyObject;

/** Options of `next()`. */
export type NextOptions<TInjected extends object> = {
	/** Values added to the context of later middleware and the handler. */
	context?: TInjected;
};

type Controls = {
	/** Runs later middleware and the handler, and resolves to their response. */
	next<TInjected extends object = EmptyObject>(
		options?: NextOptions<TInjected>,
	): Promise<NextResponse<TInjected>>;
};

type UnknownRequest = {
	params: unknown;
	headers: unknown;
	body: unknown;
	query: unknown;
	errors: Readonly<Record<string, unknown>>;
};

export type RequestFields = Partial<UnknownRequest>;

/** The metadata shape a route carries, or `DefaultMeta` for routes without one. */
export type MetaShapeOf<TRoute> = TRoute extends {
	readonly metaShape?: infer TShape;
}
	? Exclude<TShape, undefined>
	: DefaultMeta;

// Later `.meta()` calls may set metadata, so middleware added before any is
// set reads the declared shape.
type MiddlewareRoute<TRoute extends RouteDefinition> = TRoute extends {
	meta: object;
}
	? TRoute
	: TRoute & { readonly meta?: Partial<MetaShapeOf<TRoute>> };

/** The request inline middleware receives, typed by its route and context. */
export type MiddlewareRequest<
	TRoute extends RouteDefinition,
	TContext extends object,
> = RouteRequest<MiddlewareRoute<TRoute>, TContext> & UnknownRequest & Controls;

/** The request reusable middleware receives, with request segments typed as unknown and `route.meta` typed by the declared shape. */
export type ReusableMiddlewareRequest<
	TRequest extends RequestFields,
	TContext extends object,
	TMetaShape extends object = DefaultMeta,
> = HandlerFields &
	Omit<TRequest, "errors"> &
	(TRequest extends { errors: infer TErrors }
		? { errors: ErrorFactories<TErrors> }
		: EmptyObject) &
	UnknownRequest & {
		route: Omit<RouteDefinition, "meta"> & {
			readonly meta?: Partial<TMetaShape>;
		};
		context: Readonly<TContext>;
		/** Returns a response with a status, media type, or headers. */
		respond: RouteRespond;
	} & Controls;

/**
 * Middleware defined with `route.middleware()`. It carries the context it
 * reads as a type-only field, so `.use()` can add the context it reads and the
 * route lacks to the route's initial context.
 */
export type ReusableMiddleware<
	TRequest extends RequestFields,
	TContext extends object,
	TResult extends MaybePromise<MiddlewareResponse>,
	TMetaShape extends object = DefaultMeta,
> = ((
	request: ReusableMiddlewareRequest<TRequest, TContext, TMetaShape>,
) => TResult) & {
	readonly "~restrpc": { readonly context?: TContext };
};

/** Any middleware defined with `route.middleware()`. */
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyReusableMiddleware = ReusableMiddleware<any, any, any, any>;

type MiddlewareContext<TMiddleware extends AnyReusableMiddleware> = NonNullable<
	TMiddleware["~restrpc"]["context"]
>;

// Context the middleware reads but the route does not have yet.
type MissingContext<
	TContext extends object,
	TMiddleware extends AnyReusableMiddleware,
> = Omit<MiddlewareContext<TMiddleware>, keyof TContext>;

/** The route's initial context after using reusable middleware: the context it reads and the route lacks is provided by the host. */
export type InitialAfterReusable<
	TInitial extends object,
	TContext extends object,
	TMiddleware extends AnyReusableMiddleware,
> = ExtendContext<TInitial, MissingContext<TContext, TMiddleware>>;

/** The context after using reusable middleware: missing context it reads is added, then the context it injects. */
export type ContextAfterReusable<
	TContext extends object,
	TMiddleware extends AnyReusableMiddleware,
> = ContextAfterInline<
	ExtendContext<TContext, MissingContext<TContext, TMiddleware>>,
	Awaited<ReturnType<TMiddleware>>
>;

/** The context after inline middleware that returns `TResponse`. */
export type ContextAfterInline<
	TContext extends object,
	TResponse,
> = InjectContext<TContext, InjectedOf<TResponse>>;
