import type { Contract, RouteDefinition } from "@rest-rpc/core/contract";
import type { EmptyObject, MaybePromise } from "@rest-rpc/core/utils";
import type { HandlerMethodFor, StaticMethodFor } from "./routeBuilder.ts";
import type {
	AnyReusableMiddleware,
	ContextAfterInline,
	ContextAfterReusable,
	ContextFields,
	InitialAfterReusable,
	IsStaticRoute,
	MetaShapeOf,
	MiddlewareRequest,
	MiddlewareResponse,
	RequestFields,
	ReusableMiddlewareRequest,
} from "./routeBuilder.types.ts";
import type { ExtendContext } from "./context.ts";

type ContractRoute = { readonly "~restrpc": RouteDefinition };

/**
 * A contract implementer leaf, with handler, middleware and context methods.
 * `TStatic` is `false` once middleware is added, which removes `static()`.
 */
export type ContractImplementerLeaf<
	TContract extends ContractRoute,
	TInitial extends object,
	TContext extends object = TInitial,
	TStatic extends boolean = true,
> = {
	readonly "~restrpc": TContract["~restrpc"] &
		ContextFields<TInitial, TContext>;
} & HandlerMethodFor<TContract["~restrpc"], TInitial, TContext> &
	(TStatic extends true
		? IsStaticRoute<TContract["~restrpc"]> extends true
			? StaticMethodFor<TContract["~restrpc"], TInitial, TContext>
			: EmptyObject
		: EmptyObject) & {
		/** Declares initial context the host provides for this implementation. Repeated declarations must all be satisfied. @see {@link https://rest-rpc.vercel.app/docs/middleware#context} */
		$context<TValues extends object>(): ContractImplementerLeaf<
			TContract,
			ExtendContext<TInitial, TValues>,
			ExtendContext<TContext, TValues>,
			TStatic
		>;
		/** Wraps this contract leaf with middleware. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
		use<TResult extends MaybePromise<MiddlewareResponse>>(
			middleware: (
				request: MiddlewareRequest<TContract["~restrpc"], TContext>,
			) => TResult,
		): ContractImplementerLeaf<
			TContract,
			TInitial,
			ContextAfterInline<TContext, Awaited<TResult>>,
			false
		>;
		/** Wraps this contract leaf with middleware defined with `route.middleware()`. @see {@link https://rest-rpc.vercel.app/docs/middleware#reuse-middleware} */
		use<TMiddleware extends AnyReusableMiddleware>(
			middleware: TMiddleware &
				NoInfer<
					(
						request: MiddlewareRequest<
							TContract["~restrpc"],
							ContextAfterReusable<TContext, TMiddleware>
						>,
					) => unknown
				>,
		): ContractImplementerLeaf<
			TContract,
			InitialAfterReusable<TInitial, TContext, TMiddleware>,
			ContextAfterReusable<TContext, TMiddleware>,
			false
		>;
	};

/** A contract implementer subtree, or a leaf with handler, middleware and context methods. */
export type ContractImplementerNode<
	TContract extends Contract,
	TInitial extends object,
	TContext extends object = TInitial,
	TStatic extends boolean = true,
> = TContract extends ContractRoute
	? ContractImplementerLeaf<TContract, TInitial, TContext, TStatic>
	: {
			readonly [TKey in keyof TContract]: ContractImplementerNode<
				Extract<TContract[TKey], Contract>,
				TInitial,
				TContext,
				TStatic
			>;
		};

// The union of the metadata shapes of the routes in a contract tree.
type ContractMetaShape<TContract> = TContract extends ContractRoute
	? MetaShapeOf<TContract["~restrpc"]>
	: {
			[TKey in keyof TContract]: ContractMetaShape<TContract[TKey]>;
		}[keyof TContract];

/** The `$context()` and `use()` methods of a contract implementer tree. */
export type ImplementerRootMethods<
	TContract extends Contract,
	TInitial extends object,
	TContext extends object = TInitial,
	TMetaShape extends object = ContractMetaShape<TContract>,
	TStatic extends boolean = true,
> = {
	/** Declares initial context the host provides for every route in this implementation tree. Repeated declarations must all be satisfied. @see {@link https://rest-rpc.vercel.app/docs/middleware#context} */
	$context<TValues extends object>(): ContractImplementerRoot<
		TContract,
		ExtendContext<TInitial, TValues>,
		ExtendContext<TContext, TValues>,
		TStatic
	>;
	/** Applies middleware to each route in this implementation tree. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
	use<TResult extends MaybePromise<MiddlewareResponse>>(
		middleware: (
			request: ReusableMiddlewareRequest<RequestFields, TContext, TMetaShape>,
		) => TResult,
	): ContractImplementerRoot<
		TContract,
		TInitial,
		ContextAfterInline<TContext, Awaited<TResult>>,
		false
	>;
	/** Applies middleware defined with `route.middleware()` to each route in this implementation tree. @see {@link https://rest-rpc.vercel.app/docs/middleware#reuse-middleware} */
	use<TMiddleware extends AnyReusableMiddleware>(
		middleware: TMiddleware &
			NoInfer<
				(
					request: ReusableMiddlewareRequest<
						RequestFields,
						ContextAfterReusable<TContext, TMiddleware>,
						TMetaShape
					>,
				) => unknown
			>,
	): ContractImplementerRoot<
		TContract,
		InitialAfterReusable<TInitial, TContext, TMiddleware>,
		ContextAfterReusable<TContext, TMiddleware>,
		false
	>;
};

/** The root of a contract implementer tree, with methods applied to every route in it. */
export type ContractImplementerRoot<
	TContract extends Contract,
	TInitial extends object,
	TContext extends object = TInitial,
	TStatic extends boolean = true,
> = TContract extends ContractRoute
	? ContractImplementerNode<TContract, TInitial, TContext, TStatic>
	: {
			readonly [
				TKey in Exclude<keyof TContract, "use" | "$context">
			]: ContractImplementerNode<
				Extract<TContract[TKey], Contract>,
				TInitial,
				TContext,
				TStatic
			>;
		} & ImplementerRootMethods<
			TContract,
			TInitial,
			TContext,
			ContractMetaShape<TContract>,
			TStatic
		>;

/** Recursively exposes middleware and handler attachment on every route in a core contract. */
export type ContractImplementer<
	TContract extends Contract,
	TInitial extends object = EmptyObject,
	TContext extends object = TInitial,
> = ContractImplementerRoot<TContract, TInitial, TContext>;
