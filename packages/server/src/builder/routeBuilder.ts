import {
	defaultRouteState,
	RouteBuilder,
	type BuilderFor,
	type BuilderKind,
	type BuilderState,
	type DefinitionFor,
	type NextState,
	type OmittedMethods,
	type RootBuilderState,
	type RouteDefinition,
	type ServerRequest,
} from "@rest-rpc/core/contract";
import type { EmptyObject, MaybePromise, Merge } from "@rest-rpc/core/utils";
import type { DefaultContext, ExtendContext } from "./context.ts";
import type {
	AllowedHandlerResult,
	AnyReusableMiddleware,
	ContextAfterInline,
	ContextAfterReusable,
	ContextFields,
	HasDefinedResponses,
	InferredRoute,
	InitialAfterReusable,
	IsStaticRoute,
	MiddlewareRequest,
	MiddlewareResponse,
	RequestFields,
	ReusableMiddleware,
	ReusableMiddlewareRequest,
	RouteRequest,
	RuntimeRouteHandler,
	ServerRouteBuilderState,
	ValidHandlerResult,
	ValidStaticResult,
} from "./routeBuilder.types.ts";
// The route a handler or middleware receives. The root defaults to POST.
type HandlerRoute<TState extends BuilderState> = Extract<
	DefinitionFor<NextState<TState, EmptyObject>>,
	RouteDefinition
>;

type RouteErrorsOf<TValue> = TValue extends { errors: infer TErrors }
	? TErrors
	: EmptyObject;

// Reusable middleware receives the request segments and errors defined on its
// builder, plus those passed as a type argument.
type ReusableRequestFor<
	TState extends BuilderState,
	TRequest extends RequestFields,
> = Merge<
	Omit<ServerRequest<HandlerRoute<TState>>, keyof TRequest> &
		Omit<TRequest, "errors"> & {
			errors: Merge<
				RouteErrorsOf<HandlerRoute<TState>> & RouteErrorsOf<TRequest>
			>;
		}
>;

// Handler types are not exported, so emitted definitions of completed routes
// expand to plain objects instead of referencing internal aliases. For the same
// reason, `HandlerMethodFor` lives here rather than in routeBuilder.types.ts.
type HandlerFor<
	TRoute extends RouteDefinition,
	TContext extends object,
	TResult,
> = (request: RouteRequest<TRoute, TContext>) => TResult;

type HandledRoute<
	TRoute extends RouteDefinition,
	TInitial extends object,
	TContext extends object,
	TResult,
> = {
	readonly "~restrpc": Merge<
		(HasDefinedResponses<TRoute> extends true
			? TRoute
			: InferredRoute<TRoute, TResult>) & {
			readonly handler: HandlerFor<TRoute, TContext, TResult>;
		} & ContextFields<TInitial, TContext>
	>;
};

/** The `handler()` method that completes a route. */
export type HandlerMethodFor<
	TRoute extends RouteDefinition,
	TInitial extends object = EmptyObject,
	TContext extends object = TInitial,
> = {
	handler<const TResult extends AllowedHandlerResult<TRoute, TContext>>(
		handler: HandlerFor<TRoute, TContext, TResult> &
			ValidHandlerResult<TRoute, TResult>,
	): HandledRoute<TRoute, TInitial, TContext, TResult>;
};

/** The `static()` method that completes a route with the same response for every request. */
export type StaticMethodFor<
	TRoute extends RouteDefinition,
	TInitial extends object = EmptyObject,
	TContext extends object = TInitial,
> = {
	static<const TResult extends AllowedHandlerResult<TRoute, EmptyObject>>(
		value: TResult & ValidStaticResult<TRoute, TResult>,
	): HandledRoute<TRoute, TInitial, TContext, TResult>;
};

// `.static()` completes routes without request segments, path params or
// middleware, so nothing runs for their requests. `.use()` omits it.
type StaticOmitted<TState extends BuilderState> =
	IsStaticRoute<TState> extends true ? never : "static";

type WithoutStatic<TState extends BuilderState> = {
	[TKey in keyof BuilderState]: TKey extends "omit"
		? TState["omit"] | "static"
		: TState[TKey];
};

/** Maps a builder state to the server route builder type, without the methods it omits. */
export interface ServerRouteBuilderKind<
	TInitial extends object = EmptyObject,
	TContext extends object = TInitial,
> extends BuilderKind {
	readonly builder: this["state"] extends infer TState extends BuilderState
		? Omit<
				ServerRouteBuilder<TState, TInitial, TContext>,
				OmittedMethods<TState> | StaticOmitted<TState>
			>
		: never;
}

/**
 * Core route builder extended with server handler and middleware attachment.
 * `TInitial` is the context the host provides, and `TContext` the context
 * middleware and the handler receive, including injected values.
 */
export class ServerRouteBuilder<
	TState extends BuilderState = RootBuilderState,
	TInitial extends object = EmptyObject,
	TContext extends object = TInitial,
> extends RouteBuilder<TState, ServerRouteBuilderKind<TInitial, TContext>> {
	/** Route definition, with the type-only context fields of {@link ContextFields}. */
	declare readonly "~restrpc": DefinitionFor<TState> &
		ContextFields<TInitial, TContext>;

	constructor(state: ServerRouteBuilderState = {}) {
		super(state);
	}

	protected override clone(state: ServerRouteBuilderState): never {
		return new ServerRouteBuilder(state) as never;
	}

	/** Attaches the server handler that completes the route. @see {@link https://rest-rpc.vercel.app/docs/route-builder#return-responses} */
	handler<
		const TResult extends AllowedHandlerResult<HandlerRoute<TState>, TContext>,
	>(
		handler: HandlerFor<HandlerRoute<TState>, TContext, TResult> &
			ValidHandlerResult<HandlerRoute<TState>, TResult>,
	): HandledRoute<HandlerRoute<TState>, TInitial, TContext, TResult> {
		return this.clone({ ...defaultRouteState(this["~restrpc"]), handler });
	}

	/** Completes the route with a response that is the same for every request, serialized once instead of per request. Routes with request segments, path params or middleware cannot be static. @see {@link https://rest-rpc.vercel.app/docs/route-builder#static-responses} */
	static<
		const TResult extends AllowedHandlerResult<
			HandlerRoute<TState>,
			EmptyObject
		>,
	>(
		value: TResult & ValidStaticResult<HandlerRoute<TState>, TResult>,
	): HandledRoute<HandlerRoute<TState>, TInitial, TContext, TResult> {
		return this.clone({
			...defaultRouteState(this["~restrpc"]),
			handler: () => value,
			static: true,
		});
	}

	/** Wraps downstream execution after request validation. It returns the response of `next()`, which can add context, or a `respond()` result. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
	use<TResult extends MaybePromise<MiddlewareResponse>>(
		middleware: (
			request: MiddlewareRequest<HandlerRoute<TState>, TContext>,
		) => TResult,
	): BuilderFor<
		ServerRouteBuilderKind<
			TInitial,
			ContextAfterInline<TContext, Awaited<TResult>>
		>,
		WithoutStatic<TState>
	>;
	/** Wraps downstream execution with middleware defined with `route.middleware()` that reads context the route lacks, which becomes initial context the host provides. @see {@link https://rest-rpc.vercel.app/docs/middleware#reuse-middleware} */
	use<TMiddleware extends AnyReusableMiddleware>(
		middleware: TMiddleware &
			NoInfer<
				(
					request: MiddlewareRequest<
						HandlerRoute<TState>,
						ContextAfterReusable<TContext, TMiddleware>
					>,
				) => unknown
			>,
	): BuilderFor<
		ServerRouteBuilderKind<
			InitialAfterReusable<TInitial, TContext, TMiddleware>,
			ContextAfterReusable<TContext, TMiddleware>
		>,
		WithoutStatic<TState>
	>;
	use(middleware: (request: never) => unknown): never {
		const state: ServerRouteBuilderState = this["~restrpc"];
		return this.clone({
			...state,
			middleware: [
				...(state.middleware ?? []),
				middleware as RuntimeRouteHandler,
			],
		});
	}

	/** Defines a reusable middleware function typed by this builder's request, errors, context and metadata shape. @see {@link https://rest-rpc.vercel.app/docs/middleware#reuse-middleware} */
	middleware<
		TRequest extends RequestFields = EmptyObject,
		TResult extends MaybePromise<MiddlewareResponse> =
			MaybePromise<MiddlewareResponse>,
	>(
		callback: (
			request: ReusableMiddlewareRequest<
				ReusableRequestFor<TState, TRequest>,
				TContext,
				TState["metaShape"]
			>,
		) => TResult,
	): ReusableMiddleware<
		ReusableRequestFor<TState, TRequest>,
		TContext,
		TResult,
		TState["metaShape"]
	> {
		// The type-only fields of `~restrpc` have no runtime values.
		const middleware = (request: never) => callback(request);
		return Object.assign(middleware, { "~restrpc": {} }) as never;
	}

	/** Declares initial context the host provides for routes built from this builder. Repeated declarations must all be satisfied. @see {@link https://rest-rpc.vercel.app/docs/middleware#context} */
	$context<TValues extends object>(): BuilderFor<
		ServerRouteBuilderKind<
			ExtendContext<TInitial, TValues>,
			ExtendContext<TContext, TValues>
		>,
		TState
	> {
		return this as never;
	}
}

/**
 * Entry point for defining routes with handlers.
 *
 * @remarks Responses are inferred from the handler unless they are defined
 * before `.handler()`. Routes are runtime-independent: the same route works
 * with the Fetch and Node HTTP handlers.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/quickstart#define-and-register-routes}
 */
export const route: BuilderFor<
	ServerRouteBuilderKind<DefaultContext, DefaultContext>,
	RootBuilderState
> = new ServerRouteBuilder<RootBuilderState, DefaultContext, DefaultContext>();
