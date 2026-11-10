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
import type { EmptyObject, Merge } from "@rest-rpc/core/utils";
import type { DefaultContext, ExtendContext } from "./context.ts";
import type {
	AllowedHandlerResult,
	HasDefinedResponses,
	InferredRoute,
	MiddlewareRequest,
	MiddlewareReturn,
	RequestFields,
	ReusableMiddlewareRequest,
	RouteRequest,
	RuntimeRouteHandler,
	ServerRouteBuilderState,
	ValidHandlerResult,
} from "./routeBuilder.types.ts";

// The route a handler or middleware receives. The root defaults to POST.
type HandlerRoute<TState extends BuilderState> = Extract<
	DefinitionFor<NextState<TState, EmptyObject>>,
	RouteDefinition
>;

type ErrorsOf<TValue> = TValue extends { errors: infer TErrors }
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
			errors: Merge<ErrorsOf<HandlerRoute<TState>> & ErrorsOf<TRequest>>;
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
	TContext extends object,
	TResult,
> = {
	readonly "~restrpc": Merge<
		(HasDefinedResponses<TRoute> extends true
			? TRoute
			: InferredRoute<TRoute, TResult>) & {
			readonly handler: HandlerFor<TRoute, TContext, TResult>;
			readonly context?: TContext;
		}
	>;
};

/** The `handler()` method that completes a route. */
export type HandlerMethodFor<
	TRoute extends RouteDefinition,
	TContext extends object = EmptyObject,
> = {
	handler<const TResult extends AllowedHandlerResult<TRoute, TContext>>(
		handler: HandlerFor<TRoute, TContext, TResult> &
			ValidHandlerResult<TRoute, TResult>,
	): HandledRoute<TRoute, TContext, TResult>;
};

/** Maps a builder state to the server route builder type, without the methods it omits. */
export interface ServerRouteBuilderKind<
	TContext extends object = EmptyObject,
> extends BuilderKind {
	readonly builder: this["state"] extends infer TState extends BuilderState
		? Omit<ServerRouteBuilder<TState, TContext>, OmittedMethods<TState>>
		: never;
}

/** Core route builder extended with server handler and middleware attachment. */
export class ServerRouteBuilder<
	TState extends BuilderState = RootBuilderState,
	TContext extends object = EmptyObject,
> extends RouteBuilder<TState, ServerRouteBuilderKind<TContext>> {
	/** Route definition. `context` is a type-only field holding the context selected with `$context()`. */
	declare readonly "~restrpc": DefinitionFor<TState> & {
		readonly context?: TContext;
	};

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
	): HandledRoute<HandlerRoute<TState>, TContext, TResult> {
		return this.clone({ ...defaultRouteState(this["~restrpc"]), handler });
	}

	/** Wraps downstream execution after request validation. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
	use(
		middleware: (
			request: MiddlewareRequest<HandlerRoute<TState>, TContext>,
		) => MiddlewareReturn,
	): BuilderFor<ServerRouteBuilderKind<TContext>, TState> {
		const state: ServerRouteBuilderState = this["~restrpc"];
		return this.clone({
			...state,
			middleware: [
				...(state.middleware ?? []),
				middleware as RuntimeRouteHandler,
			],
		});
	}

	/** Defines a reusable middleware function typed by this builder's request, errors, context and metadata shape. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
	middleware<TRequest extends RequestFields = EmptyObject>(
		callback: (
			request: ReusableMiddlewareRequest<
				ReusableRequestFor<TState, TRequest>,
				TContext,
				TState["metaShape"]
			>,
		) => MiddlewareReturn,
	): <TRouteContext extends TContext>(
		request: ReusableMiddlewareRequest<
			ReusableRequestFor<TState, TRequest>,
			TRouteContext,
			TState["metaShape"]
		>,
	) => MiddlewareReturn {
		// The callback only reads and writes keys of TContext, so it runs on any
		// route whose context extends it.
		return callback as never;
	}

	/** Adds typed values to the per-request context store of this builder, whose types win for keys already in it. @see {@link https://rest-rpc.vercel.app/docs/middleware#context} */
	$context<TValues extends object>(): BuilderFor<
		ServerRouteBuilderKind<ExtendContext<TContext, TValues>>,
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
	ServerRouteBuilderKind<DefaultContext>,
	RootBuilderState
> = new ServerRouteBuilder<RootBuilderState, DefaultContext>();
