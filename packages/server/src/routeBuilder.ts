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
import type {
	MiddlewareRequest,
	MiddlewareReturn,
	RequestFields,
	ReusableMiddlewareRequest,
} from "./middleware.types.ts";
import type { InferredRoute } from "./implicitResponse.types.ts";
import type {
	AllowedHandlerResult,
	HasDeclaredResponses,
	RouteRequest,
	RuntimeRouteHandler,
	ValidHandlerResult,
} from "./routeBuilder.types.ts";

/** Runtime declaration of a server route, including its handler and middleware. */
export type ServerRouteBuilderState = Partial<RouteDeclaration> & {
	readonly handler?: unknown;
	readonly middleware?: readonly RuntimeRouteHandler[];
};

type RootOnlyMethod = "$context" | "middleware";

// The route a handler or middleware receives. The root defaults to POST.
type HandlerRoute<TState extends BuilderState> = Extract<
	DeclarationFor<NextState<TState, EmptyObject>>,
	RouteDeclaration
>;

// Handler types are not exported, so emitted declarations of completed routes
// expand to plain objects instead of referencing internal aliases.
type HandlerFor<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
	TResult,
> = (
	request: RouteRequest<TRoute, TAdditionalHandlerFields, TContext>,
) => TResult;

type HandledRoute<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object,
	TContext extends object,
	TResult,
> = {
	readonly "~restrpc": Merge<
		(HasDeclaredResponses<TRoute> extends true
			? TRoute
			: InferredRoute<TRoute, TResult>) & {
			readonly handler: HandlerFor<
				TRoute,
				TAdditionalHandlerFields,
				TContext,
				TResult
			>;
		}
	>;
};

/** Resolves the handler operation for a complete route declaration. */
export type HandlerMethodFor<
	TRoute extends RouteDeclaration,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = {
	handler<
		const TResult extends AllowedHandlerResult<
			TRoute,
			TAdditionalHandlerFields,
			TContext
		>,
	>(
		handler: HandlerFor<TRoute, TAdditionalHandlerFields, TContext, TResult> &
			ValidHandlerResult<TRoute, TResult>,
	): HandledRoute<TRoute, TAdditionalHandlerFields, TContext, TResult>;
};

/** Builder kind of the server route builder. */
export interface ServerRouteBuilderKind<
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> extends BuilderKind {
	readonly builder: this["state"] extends infer TState extends BuilderState
		? Omit<
				ServerRouteBuilder<TState, TAdditionalHandlerFields, TContext>,
				| TState["omit"]
				| (TState["method"] extends undefined ? never : RootOnlyMethod)
			>
		: never;
}

/** Core route builder extended with server handler and middleware attachment. */
export class ServerRouteBuilder<
	TState extends BuilderState = RootBuilderState,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> extends RouteBuilder<
	TState,
	ServerRouteBuilderKind<TAdditionalHandlerFields, TContext>
> {
	constructor(state: ServerRouteBuilderState = {}) {
		super(state);
	}

	protected override clone(state: ServerRouteBuilderState): never {
		return new ServerRouteBuilder(state) as never;
	}

	/** Attaches the server handler that completes the route. @see {@link https://rest-rpc.dev/docs/route-builder#return-responses} */
	handler<
		const TResult extends AllowedHandlerResult<
			HandlerRoute<TState>,
			TAdditionalHandlerFields,
			TContext
		>,
	>(
		handler: HandlerFor<
			HandlerRoute<TState>,
			TAdditionalHandlerFields,
			TContext,
			TResult
		> &
			ValidHandlerResult<HandlerRoute<TState>, TResult>,
	): HandledRoute<
		HandlerRoute<TState>,
		TAdditionalHandlerFields,
		TContext,
		TResult
	> {
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
			request: MiddlewareRequest<
				HandlerRoute<TState>,
				TAdditionalHandlerFields,
				TContext
			>,
		) => MiddlewareReturn,
	): BuilderFor<
		ServerRouteBuilderKind<TAdditionalHandlerFields, TContext>,
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
			request: ReusableMiddlewareRequest<
				TRequest,
				TAdditionalHandlerFields,
				TContext
			>,
		) => MiddlewareReturn,
	): typeof callback {
		return callback;
	}

	/** Selects the typed per-request context store for this builder. @see {@link https://rest-rpc.dev/docs/context} */
	$context<TValues extends object>(): BuilderFor<
		ServerRouteBuilderKind<TAdditionalHandlerFields, TValues>,
		TState
	> {
		return this as never;
	}
}

/** Core route builder with server-first handler attachment enabled. */
export const serverRoute = new ServerRouteBuilder();
