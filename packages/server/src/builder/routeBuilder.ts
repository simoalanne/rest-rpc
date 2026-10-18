import {
	RouteBuilder,
	type BuilderFor,
	type BuilderKind,
	type BuilderState,
	type DeclarationFor,
	type NextState,
	type RootBuilderState,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";
import type { EmptyObject, Merge } from "@rest-rpc/core/utils";
import type { DefaultContext } from "./context.ts";
import type {
	AllowedHandlerResult,
	HasDeclaredResponses,
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

type RootOnlyMethod = "$context" | "middleware";

// The route a handler or middleware receives. The root defaults to POST.
type HandlerRoute<TState extends BuilderState> = Extract<
	DeclarationFor<NextState<TState, EmptyObject>>,
	RouteDeclaration
>;

// Handler types are not exported, so emitted declarations of completed routes
// expand to plain objects instead of referencing internal aliases. For the same
// reason, `HandlerMethodFor` lives here rather than in routeBuilder.types.ts.
type HandlerFor<
	TRoute extends RouteDeclaration,
	TContext extends object,
	TResult,
> = (request: RouteRequest<TRoute, TContext>) => TResult;

type HandledRoute<
	TRoute extends RouteDeclaration,
	TContext extends object,
	TResult,
> = {
	readonly "~restrpc": Merge<
		(HasDeclaredResponses<TRoute> extends true
			? TRoute
			: InferredRoute<TRoute, TResult>) & {
			readonly handler: HandlerFor<TRoute, TContext, TResult>;
			readonly context?: TContext;
		}
	>;
};

/** Resolves the handler operation for a complete route declaration. */
export type HandlerMethodFor<
	TRoute extends RouteDeclaration,
	TContext extends object = EmptyObject,
> = {
	handler<const TResult extends AllowedHandlerResult<TRoute, TContext>>(
		handler: HandlerFor<TRoute, TContext, TResult> &
			ValidHandlerResult<TRoute, TResult>,
	): HandledRoute<TRoute, TContext, TResult>;
};

/** Builder kind of the server route builder. */
export interface ServerRouteBuilderKind<
	TContext extends object = EmptyObject,
> extends BuilderKind {
	readonly builder: this["state"] extends infer TState extends BuilderState
		? Omit<
				ServerRouteBuilder<TState, TContext>,
				| TState["omit"]
				| (TState["method"] extends undefined ? never : RootOnlyMethod)
			>
		: never;
}

/** Core route builder extended with server handler and middleware attachment. */
export class ServerRouteBuilder<
	TState extends BuilderState = RootBuilderState,
	TContext extends object = EmptyObject,
> extends RouteBuilder<TState, ServerRouteBuilderKind<TContext>> {
	/** Route declaration. `context` is a type-only field holding the context selected with `$context()`. */
	declare readonly "~restrpc": DeclarationFor<TState> & {
		readonly context?: TContext;
	};

	constructor(state: ServerRouteBuilderState = {}) {
		super(state);
	}

	protected override clone(state: ServerRouteBuilderState): never {
		return new ServerRouteBuilder(state) as never;
	}

	/** Attaches the server handler that completes the route. @see {@link https://rest-rpc.dev/docs/route-builder#return-responses} */
	handler<
		const TResult extends AllowedHandlerResult<HandlerRoute<TState>, TContext>,
	>(
		handler: HandlerFor<HandlerRoute<TState>, TContext, TResult> &
			ValidHandlerResult<HandlerRoute<TState>, TResult>,
	): HandledRoute<HandlerRoute<TState>, TContext, TResult> {
		const state: ServerRouteBuilderState = this["~restrpc"];
		return this.clone({
			...(state.method
				? {}
				: {
						method: "POST",
						path: undefined,
						responses: {},
					}),
			...state,
			handler,
		});
	}

	/** Wraps downstream execution after request validation. @see {@link https://rest-rpc.dev/docs/middleware} */
	use(
		middleware: (
			request: MiddlewareRequest<HandlerRoute<TState>, TContext>,
		) => MiddlewareReturn,
	): BuilderFor<
		ServerRouteBuilderKind<TContext>,
		NextState<
			TState,
			{ method: TState["method"]; omit: TState["omit"] | RootOnlyMethod }
		>
	> {
		const state: ServerRouteBuilderState = this["~restrpc"];
		return this.clone({
			...state,
			middleware: [
				...(state.middleware ?? []),
				middleware as RuntimeRouteHandler,
			],
		});
	}

	/** Declares a reusable middleware function on the untouched route root. @see {@link https://rest-rpc.dev/docs/middleware} */
	middleware<TRequest extends RequestFields = RequestFields>(
		callback: (
			request: ReusableMiddlewareRequest<TRequest, TContext>,
		) => MiddlewareReturn,
	): typeof callback {
		return callback;
	}

	/** Selects the typed per-request context store for this builder. @see {@link https://rest-rpc.dev/docs/context} */
	$context<TValues extends object>(): BuilderFor<
		ServerRouteBuilderKind<TValues>,
		TState
	> {
		return this as never;
	}
}

/**
 * Entry point for declaring routes with handlers.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`. Routes are runtime-independent: the same route works
 * with the Fetch and Node HTTP handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 */
export const route = new ServerRouteBuilder<RootBuilderState, DefaultContext>();
