import type {
	InferredRoute,
	ValidImplicitResult,
	UsesPlainOutput,
} from "./implicitResponse.types.ts";
import type {
	AbsolutePath,
	BuilderExtension,
	BuilderState,
	InferServerRequest,
	PublicDeclarationFor,
	RootRouteBuilder,
	RouteBuilderView,
	RouteDeclaration,
	RouteMetadata,
	RouteTree,
	ServerErrors,
	ServerResponse,
	ServerResponseBody,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type { SseServerEvent } from "./sse.ts";
import type { Context } from "./context.ts";
import type {
	MiddlewareRequest,
	MiddlewareReturn,
	ReusableMiddlewareRequest,
	RequestFields,
} from "./middleware.types.ts";

/**
 * Infers the declared non-2xx response envelopes for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteErrors<
	TRoute extends { readonly "~restrpc": RouteDeclaration },
> = ServerErrors<TRoute["~restrpc"]>;

type EmptyObject = Record<never, never>;
type RequestTransportFields = {
	contentType?: string;
	lastEventId?: string;
};
type MaybePromise<T> = T | Promise<T>;

/** Untyped route handler stored in a completed runtime route declaration. */
export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;

/** Runtime route-builder shape used internally by server extensions. */
export type RuntimeServerRoute = {
	readonly "~restrpc": Partial<RouteDeclaration> & {
		readonly handler?: unknown;
		readonly middleware?: readonly RuntimeRouteHandler[];
	};
	clone(state: object): RuntimeServerRoute;
};

type WithSseServerEvents<T> =
	T extends AsyncIterable<infer TItem>
		? AsyncIterable<TItem | SseServerEvent<TItem>>
		: T extends { body: infer TBody }
			? TBody extends AsyncIterable<infer TItem>
				? Omit<T, "body"> & {
						body: AsyncIterable<TItem | SseServerEvent<TItem>>;
					}
				: T
			: T;

type HandlerResult<TRoute extends RouteDeclaration> = MaybePromise<
	UsesPlainOutput<TRoute> extends true
		? TRoute extends { responses: { 200: infer TResponse } }
			? ProcedureHandlerResult<TResponse>
			: never
		: WithSseServerEvents<ServerResponse<TRoute>>
>;

/**
 * Infers the validated request, adapter fields, and application context
 * received by a handler.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteRequest<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = Merge<
	InferServerRequest<{ readonly "~restrpc": TRoute }> &
		RequestTransportFields &
		TAdditionalHandlerFields & {
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
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = (
	...args: [request: RouteRequest<TRoute, TAdditionalHandlerFields, TContext>]
) => HandlerResult<TRoute>;

/**
 * Infers handler signatures for a route or a nested object tree of routes.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type RouteHandlerFor<
	T extends RouteTree,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = T extends { readonly "~restrpc": infer TRoute extends RouteDeclaration }
	? RouteHandler<TRoute, TAdditionalHandlerFields, TContext>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? RouteHandlerFor<T[K], TAdditionalHandlerFields, TContext>
				: never;
		};

type Merge<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

/** Terminal builder shape containing a route declaration and its handler. */
export type CompletedRoute<TRoute, THandler> = {
	readonly "~restrpc": Merge<TRoute & { readonly handler: THandler }>;
};

type HasDeclaredResponses<TRoute> = TRoute extends {
	responses: infer TResponses;
}
	? keyof TResponses extends never
		? false
		: true
	: false;

type HandlerFor<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
	TResult,
> = (
	request: RouteRequest<TRoute, TAdditionalHandlerFields, TContext>,
) => TResult;

type HandlerImplementation<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
	TResult,
	TPublicRoute extends RouteDeclaration = TRoute,
> = CompletedRoute<
	TPublicRoute,
	HandlerFor<TRoute, TAdditionalHandlerFields, TContext, TResult>
>;

type ProcedureContentType<TContentType> = TContentType extends readonly string[]
	? TContentType[number]
	: TContentType;

type ProcedureHandlerResult<TResponse> = TResponse extends {
	contentType: infer TContentType;
}
	? TContentType extends "application/json"
		? ServerResponseBody<TResponse>
		: {
				data: ServerResponseBody<TResponse>;
				contentType: ProcedureContentType<TContentType>;
			}
	: WithSseServerEvents<ServerResponseBody<TResponse>>;

type ProcedureHandlerMethod<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> =
	HasDeclaredResponses<TRoute> extends true
		? TRoute extends {
				responses: {
					200: infer TResponse extends {
						body: StandardSchemaV1;
					};
				};
			}
			? {
					handler<
						const TResult extends MaybePromise<
							ProcedureHandlerResult<TResponse>
						>,
					>(
						handler: HandlerFor<
							TRoute,
							TAdditionalHandlerFields,
							TContext,
							TResult
						>,
					): HandlerImplementation<
						TRoute,
						TAdditionalHandlerFields,
						TContext,
						TResult
					>;
				}
			: never
		: ImplicitHandlerMethod<TRoute, TAdditionalHandlerFields, TContext>;

type HttpHandlerMethod<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> =
	HasDeclaredResponses<TRoute> extends true
		? {
				handler<
					const TResult extends ReturnType<
						RouteHandler<TRoute, TAdditionalHandlerFields, TContext>
					>,
				>(
					handler: HandlerFor<
						TRoute,
						TAdditionalHandlerFields,
						TContext,
						TResult
					>,
				): HandlerImplementation<
					TRoute,
					TAdditionalHandlerFields,
					TContext,
					TResult
				>;
			}
		: ImplicitHandlerMethod<TRoute, TAdditionalHandlerFields, TContext>;

type ImplicitHandlerMethod<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = {
	handler<const TResult>(
		handler: HandlerFor<TRoute, TAdditionalHandlerFields, TContext, TResult> &
			ValidImplicitResult<TResult>,
	): HandlerImplementation<
		TRoute,
		TAdditionalHandlerFields,
		TContext,
		TResult,
		InferredRoute<TRoute, TResult>
	>;
};

/** Resolves the handler operation for a complete route declaration. */
export type HandlerMethodFor<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> =
	UsesPlainOutput<TRoute> extends true
		? ProcedureHandlerMethod<TRoute, TAdditionalHandlerFields, TContext>
		: HttpHandlerMethod<TRoute, TAdditionalHandlerFields, TContext>;

type MiddlewareUseMethod<
	TState extends BuilderState,
	TPath extends AbsolutePath | undefined,
	TMetadata extends RouteMetadata | never,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = {
	/** Wraps downstream execution after request validation. @see {@link https://rest-rpc.dev/docs/middleware} */
	use<TReceiver extends { readonly "~restrpc": object }>(
		this: TReceiver,
		middleware: (
			request: MiddlewareRequest<
				Extract<
					PublicDeclarationFor<TState, TPath, TMetadata>,
					RouteDeclaration
				>,
				TAdditionalHandlerFields,
				TContext
			>,
		) => MiddlewareReturn,
	): TReceiver["~restrpc"] extends RouteDeclaration
		? RouteBuilderView<
				TState,
				ServerBuilderExtension<TAdditionalHandlerFields, TContext>,
				TPath,
				TMetadata
			>
		: RootRouteBuilder<
				undefined,
				ServerBuilderExtension<TAdditionalHandlerFields, TContext>
			>;
};

/** Core builder extension that exposes middleware and server handler attachment. */
export interface ServerBuilderExtension<
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> extends BuilderExtension {
	readonly result: this["state"] extends infer TState extends BuilderState
		? PublicDeclarationFor<
				TState,
				this["path"],
				Extract<this["metadata"], RouteMetadata>
			> extends infer TRoute extends RouteDeclaration
			? HandlerMethodFor<TRoute, TAdditionalHandlerFields, TContext> &
					MiddlewareUseMethod<
						TState,
						this["path"],
						Extract<this["metadata"], RouteMetadata>,
						TAdditionalHandlerFields,
						TContext
					>
			: never
		: never;
}

/**
 * Route builder that finishes declarations by attaching a server handler.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 */
export type ServerRouteBuilder<
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = RootRouteBuilder<
	undefined,
	ServerBuilderExtension<TAdditionalHandlerFields, TContext>
> & {
	/** Selects the typed per-request context store for this builder. @see {@link https://rest-rpc.dev/docs/context} */
	$context<TValues extends object>(): ServerRouteBuilder<
		TAdditionalHandlerFields,
		TValues
	>;
	/** Declares a reusable middleware function on the untouched route root. @see {@link https://rest-rpc.dev/docs/middleware} */
	middleware<TRequest extends RequestFields = RequestFields>(
		callback: (
			request: ReusableMiddlewareRequest<
				TRequest,
				TAdditionalHandlerFields,
				TContext
			>,
		) => MiddlewareReturn,
	): (
		request: ReusableMiddlewareRequest<
			TRequest,
			TAdditionalHandlerFields,
			TContext
		>,
	) => MiddlewareReturn;
};
