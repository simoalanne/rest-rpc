import type {
	BuilderExtension,
	BuilderState,
	PublicDeclarationFor,
	RouteDeclaration,
	RouteMetadata,
	ServerErrors,
	ServerRequest,
	ServerResponse,
	ServerResponseBody,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";

type EmptyObject = Record<never, never>;
type AnyRouteHandler = (...args: never[]) => unknown;
type MaybePromise<T> = T | Promise<T>;

/** Untyped route handler stored in a completed runtime route declaration. */
export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;

/**
 * Infers the validated request data declared for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequestData<TRoute extends RouteDeclaration> =
	ServerRequest<TRoute>;

/**
 * Infers the declared non-2xx response envelopes for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteErrors<TRoute extends RouteDeclaration> = ServerErrors<TRoute>;

/**
 * Infers every response envelope a route handler may return.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteResponse<TRoute extends RouteDeclaration> =
	ServerResponse<TRoute>;

type RequestValue<TRoute extends RouteDeclaration> =
	RouteRequestData<TRoute> extends never
		? EmptyObject
		: RouteRequestData<TRoute>;

type HandlerResult<TRoute extends RouteDeclaration> = MaybePromise<
	RouteResponse<TRoute>
>;

/**
 * Infers the validated request, adapter fields, and application context
 * received by a handler.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = Merge<
	(TRoute["kind"] extends "procedure"
		? TRoute extends {
				request: { body: infer TInput extends StandardSchemaV1 };
			}
			? { input: StandardSchemaV1.InferOutput<TInput> } & Omit<
					RequestValue<TRoute>,
					"body"
				>
			: EmptyObject
		: RequestValue<TRoute>) &
		TAdditionalHandlerFields & {
			route: TRoute;
			context: TContext;
		}
>;

/**
 * Infers the complete handler signature for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = (
	...args: [request: RouteRequest<TRoute, TAdditionalHandlerFields, TContext>]
) => HandlerResult<TRoute>;

type Merge<T> = { [TKey in keyof T]: T[TKey] };

/**
 * HTTP response shape from which a server-first route infers its contract.
 *
 * @remarks An `AsyncIterable` body always denotes an NDJSON stream. Providing
 * `contentType` selects a custom-content response for non-stream bodies;
 * otherwise bodies use JSON.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first-quickstart#infer-responses-from-the-handler}
 */
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

/**
 * Body encodings inferred from a server-first response.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first-quickstart#use-the-ordinary-client-apis}
 */
export type ServerFirstResponseKind = "empty" | "json" | "stream" | "custom";

type BodyResponseKind<TResponse, TBody> =
	TBody extends AsyncIterable<unknown>
		? "stream"
		: TResponse extends { contentType: string }
			? "custom"
			: "json";

/**
 * Infers the body encoding selected by a server-first response shape.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first-quickstart#infer-responses-from-the-handler}
 */
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
		? ClientSchema<TItem>
		: ClientSchema<TBody>
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
			(TResponse extends { responseHeaders: infer THeaders }
				? {
						headers: ClientSchema<SerializedResponseHeaders<THeaders>>;
					}
				: unknown)
	: { body: undefined } & (TResponse extends {
			responseHeaders: infer THeaders;
		}
			? {
					headers: ClientSchema<SerializedResponseHeaders<THeaders>>;
				}
			: unknown);

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

type InferredProcedureResponse<TResult> =
	Awaited<TResult> extends infer TOutput
		? TOutput extends AsyncIterable<infer TItem>
			? { kind: "stream"; body: ClientSchema<TItem> }
			: TOutput extends {
						contentType: infer TContentType extends string;
						data: infer TData;
				  }
				? { body: ClientSchema<TData>; contentType: TContentType }
				: { body: ClientSchema<TOutput>; contentType: "application/json" }
		: never;

type InferredProcedureRoute<TRoute, TResult> = Omit<TRoute, "responses"> & {
	responses: { 200: InferredProcedureResponse<TResult> };
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
	: ServerResponseBody<TResponse>;

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

/**
 * Infers the handler response union retained by a server-first implementation.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first-quickstart#infer-responses-from-the-handler}
 */
export type InferredRouteResponse<TImplementation> =
	ImplementationParts<TImplementation> extends { handler: infer THandler }
		? THandler extends AnyRouteHandler
			? Awaited<ReturnType<THandler>>
			: never
		: never;

/**
 * Infers the body encodings represented by a server-first implementation.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first-quickstart#use-the-ordinary-client-apis}
 */
export type ServerFirstRouteResponseKind<TImplementation> =
	ImplementationParts<TImplementation> extends {
		route: infer TRoute;
		handler: infer THandler extends AnyRouteHandler;
	}
		? TRoute extends {
				kind: "procedure";
				responses: { 200: infer TResponse };
			}
			? TResponse extends { kind: "stream" }
				? "stream"
				: TResponse extends { contentType: infer TContentType }
					? TContentType extends "application/json"
						? "json"
						: "custom"
					: "json"
			: ImplicitResponseKind<Awaited<ReturnType<THandler>>>
		: never;

/**
 * Route builder that finishes declarations by attaching a server handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first-quickstart#define-routes-and-handlers}
 */
export type ServerRouteBuilder<
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = import("@rest-rpc/core/contract").RootRouteBuilder<
	undefined,
	ServerBuilderExtension<TAdditionalHandlerFields, TContext>
>;
