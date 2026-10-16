import type { ValidImplicitResult } from "./implicitResponse.types.ts";
import type {
	BuilderFor,
	InferServerRequest,
	RootBuilderState,
	RouteDeclaration,
	RouteTree,
	ServerResponse,
	ServerResponseBody,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type { SseServerEvent } from "./sse.ts";
import type { Context } from "./context.ts";
import type { RequestTransportFields } from "./middleware.types.ts";
import type { ServerRouteBuilderKind } from "./routeBuilder.ts";
import type { EmptyObject, MaybePromise, Merge } from "@rest-rpc/core/utils";

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

// Handlers may return the body of a declared 200 response directly, unless its
// content type must be selected from a list.
type PlainResponseBody<TRoute extends RouteDeclaration> = TRoute extends {
	responses: { 200: infer TResponse };
}
	? TResponse extends { contentType: readonly string[] }
		? never
		: TResponse extends { body: StandardSchemaV1 }
			? WithSseItems<ServerResponseBody<TResponse>>
			: never
	: never;

type HandlerResult<TRoute extends RouteDeclaration> = MaybePromise<
	WithSseServerEvents<ServerResponse<TRoute>> | PlainResponseBody<TRoute>
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
	TAdditionalHandlerFields extends object,
	TContext extends object,
> =
	HasDeclaredResponses<TRoute> extends true
		? ReturnType<RouteHandler<TRoute, TAdditionalHandlerFields, TContext>>
		: unknown;

/** Rejects invalid implicit response envelopes. */
export type ValidHandlerResult<TRoute extends RouteDeclaration, TResult> =
	HasDeclaredResponses<TRoute> extends true
		? unknown
		: ValidImplicitResult<TResult>;

/**
 * Route builder that finishes declarations by attaching a server handler.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 */
export type PublicServerRouteBuilder<
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = BuilderFor<
	ServerRouteBuilderKind<TAdditionalHandlerFields, TContext>,
	RootBuilderState
>;
