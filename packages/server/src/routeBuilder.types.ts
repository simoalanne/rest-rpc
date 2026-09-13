import type {
	BuilderExtension,
	BuilderState,
	CustomResponseBody,
	CustomResponseValue,
	NoBody,
	PublicDeclarationFor,
	RouteDeclaration,
	RouteMetadata,
	ServerErrors,
	ServerRequest,
	ServerResponse,
	Stream,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";

type EmptyObject = Record<never, never>;
type AnyRouteHandler = (...args: never[]) => unknown;
type MaybePromise<T> = T | Promise<T>;

/** Untyped route handler stored in a completed runtime route declaration. */
export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;

/** Infers the validated request data for a route declaration. */
export type RouteRequestData<TRoute extends RouteDeclaration> =
	ServerRequest<TRoute>;

/** Infers the declared non-success responses for a route. */
export type RouteErrors<TRoute extends RouteDeclaration> = ServerErrors<TRoute>;

/** Infers the declared explicit response union for a route. */
export type RouteResponse<TRoute extends RouteDeclaration> =
	ServerResponse<TRoute>;

type RequestValue<TRoute extends RouteDeclaration> =
	RouteRequestData<TRoute> extends never
		? EmptyObject
		: RouteRequestData<TRoute>;

type HandlerResult<TRoute extends RouteDeclaration> = MaybePromise<
	RouteResponse<TRoute>
>;

/** Infers the route handler request type for a route declaration. */
export type RouteRequest<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = Merge<
	(TRoute["kind"] extends "procedure"
		? TRoute extends {
				request: { body: infer TInput extends StandardSchemaV1 };
			}
			? { input: StandardSchemaV1.InferOutput<TInput> }
			: EmptyObject
		: RequestValue<TRoute>) &
		TAdditionalHandlerFields & {
			route: TRoute;
			context: TContext;
		}
>;

/** Infers the route handler function type for a route declaration. */
export type RouteHandler<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = (
	...args: [request: RouteRequest<TRoute, TAdditionalHandlerFields, TContext>]
) => HandlerResult<TRoute>;

type Merge<T> = { [TKey in keyof T]: T[TKey] };

/** Explicit HTTP response envelope accepted from an inferred route handler. */
export type ImplicitResponseEnvelope =
	| {
			status: number;
			body?: never;
			contentType?: string;
			responseHeaders?: Record<string, string | number | undefined>;
	  }
	| {
			status: number;
			body: unknown;
			contentType?: string;
			responseHeaders?: Record<string, string | number | undefined>;
	  };

/** Wire response classifications available to server-first HTTP routes. */
export type ServerFirstResponseKind =
	| "empty"
	| "json"
	| "ndjson"
	| "custom"
	| "custom-stream";

type BodyResponseKind<TResponse, TBody> =
	TBody extends AsyncIterable<unknown>
		? TResponse extends { contentType: string }
			? "custom-stream"
			: "ndjson"
		: TResponse extends { contentType: string }
			? "custom"
			: "json";

/** Classifies one inferred response envelope by its statically known shape. */
export type ImplicitResponseKind<TResponse> = TResponse extends unknown
	? "body" extends keyof TResponse
		? TResponse extends { body: infer TBody }
			? BodyResponseKind<TResponse, TBody>
			: "empty"
		: "empty"
	: never;

type ClientSchema<TOutput> = StandardSchemaV1<unknown, TOutput>;

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

type ImplicitResponseBodyDeclaration<TResponse> = TResponse extends {
	body: infer TBody;
}
	? TBody extends AsyncIterable<infer TItem>
		? TResponse extends { contentType: infer TContentType extends string }
			? Stream<
					CustomResponseBody<ClientSchema<CustomResponseValue>, TContentType>
				>
			: Stream<ClientSchema<TItem>>
		: TResponse extends { contentType: infer TContentType extends string }
			? CustomResponseBody<ClientSchema<CustomResponseValue>, TContentType>
			: ClientSchema<TBody>
	: NoBody;

type ImplicitResponseDeclaration<TResponse> =
	ImplicitResponseBodyDeclaration<TResponse> extends infer TBody
		? TResponse extends { responseHeaders: infer THeaders }
			? {
					body: TBody;
					headers: ClientSchema<SerializedResponseHeaders<THeaders>>;
				}
			: TBody
		: never;

type ResponseStatuses<TResponse> = TResponse extends {
	status: infer TStatus extends number;
}
	? TStatus
	: never;

type InferredResponses<TResponse> = {
	[TStatus in ResponseStatuses<TResponse>]: ImplicitResponseDeclaration<
		Extract<TResponse, { status: TStatus }>
	>;
};

type InferredHttpRoute<TRoute, TResult> = Omit<TRoute, "responses"> & {
	responses: InferredResponses<Awaited<TResult>>;
};

type InferredProcedureRoute<TRoute, TResult> = Omit<TRoute, "responses"> & {
	responses: { 200: ClientSchema<Awaited<TResult>> };
};

/** Terminal builder shape containing a route declaration and its handler. */
export type CompletedRoute<TRoute, THandler> = {
	readonly "~restrpc": TRoute & { readonly handler: THandler };
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
	TPublicRoute = TRoute,
> = CompletedRoute<
	TPublicRoute,
	HandlerFor<TRoute, TAdditionalHandlerFields, TContext, TResult>
>;

type ProcedureHandlerMethod<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> =
	HasDeclaredResponses<TRoute> extends true
		? TRoute extends {
				responses: { 200: infer TOutput extends StandardSchemaV1 };
			}
			? {
					handler<
						const TResult extends MaybePromise<
							StandardSchemaV1.InferInput<TOutput>
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
		: {
				handler<const TResult>(
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
					TResult,
					InferredProcedureRoute<TRoute, TResult>
				>;
			};

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
		: {
				handler<const TResult extends MaybePromise<ImplicitResponseEnvelope>>(
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
					TResult,
					InferredHttpRoute<TRoute, TResult>
				>;
			};

/** Resolves the handler operation for a complete route declaration. */
export type HandlerMethodFor<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = TRoute["kind"] extends "procedure"
	? ProcedureHandlerMethod<TRoute, TAdditionalHandlerFields, TContext>
	: HttpHandlerMethod<TRoute, TAdditionalHandlerFields, TContext>;

/** Core builder extension that exposes server handler attachment. */
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
			? HandlerMethodFor<TRoute, TAdditionalHandlerFields, TContext>
			: never
		: never;
}

type ImplementationParts<TImplementation> = TImplementation extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration & {
		handler: infer THandler extends AnyRouteHandler;
	};
}
	? { route: TRoute; handler: THandler }
	: never;

/** Infers the source response union retained by a server-first implementation. */
export type InferredRouteResponse<TImplementation> =
	ImplementationParts<TImplementation> extends { handler: infer THandler }
		? THandler extends AnyRouteHandler
			? Awaited<ReturnType<THandler>>
			: never
		: never;

/** Infers the wire response kinds represented by a server-first implementation. */
export type ServerFirstRouteResponseKind<TImplementation> =
	ImplementationParts<TImplementation> extends {
		route: infer TRoute;
		handler: infer THandler extends AnyRouteHandler;
	}
		? TRoute extends { kind: "procedure" }
			? "json"
			: ImplicitResponseKind<Awaited<ReturnType<THandler>>>
		: never;

/** Shared core route builder with server-first handler typing. */
export type ServerRouteBuilder<
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = import("@rest-rpc/core/contract").RootRouteBuilder<
	undefined,
	ServerBuilderExtension<TAdditionalHandlerFields, TContext>
>;
