import type { Contract, RouteDefinition } from "@rest-rpc/core/contract";
import type { HandlerMethodFor } from "./routeBuilder.ts";
import type {
	MetaShapeOf,
	MiddlewareRequest,
	MiddlewareReturn,
	RequestFields,
	ReusableMiddlewareRequest,
} from "./routeBuilder.types.ts";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type { ExtendContext } from "./context.ts";

type ContractRoute = { readonly "~restrpc": RouteDefinition };

/** A contract implementer subtree, or a leaf with handler, middleware and context methods. */
export type ContractImplementerNode<
	TContract extends Contract,
	TContext extends object,
> = TContract extends ContractRoute
	? {
			readonly "~restrpc": TContract["~restrpc"] & {
				readonly context?: TContext;
			};
		} & HandlerMethodFor<TContract["~restrpc"], TContext> & {
				/** Adds typed values to the per-request context store of this implementation, whose types win for keys already in it. @see {@link https://rest-rpc.vercel.app/docs/middleware#context} */
				$context<TValues extends object>(): ContractImplementerNode<
					TContract,
					ExtendContext<TContext, TValues>
				>;
				/** Wraps this contract leaf with middleware. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
				use(
					middleware: (
						request: MiddlewareRequest<TContract["~restrpc"], TContext>,
					) => MiddlewareReturn,
				): ContractImplementerNode<TContract, TContext>;
			}
	: {
			readonly [TKey in keyof TContract]: ContractImplementerNode<
				Extract<TContract[TKey], Contract>,
				TContext
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
	TContext extends object,
> = {
	/** Adds typed values to the per-request context store of this implementation tree, whose types win for keys already in it. @see {@link https://rest-rpc.vercel.app/docs/middleware#context} */
	$context<TValues extends object>(): ContractImplementerRoot<
		TContract,
		ExtendContext<TContext, TValues>
	>;
	/** Applies middleware to each route in this implementation tree. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
	use(
		middleware: (
			request: ReusableMiddlewareRequest<
				RequestFields,
				TContext,
				ContractMetaShape<TContract>
			>,
		) => MiddlewareReturn,
	): ContractImplementerRoot<TContract, TContext>;
};

/** The root of a contract implementer tree, with methods applied to every route in it. */
export type ContractImplementerRoot<
	TContract extends Contract,
	TContext extends object,
> = TContract extends ContractRoute
	? ContractImplementerNode<TContract, TContext>
	: {
			readonly [
				TKey in Exclude<keyof TContract, "use" | "$context">
			]: ContractImplementerNode<Extract<TContract[TKey], Contract>, TContext>;
		} & ImplementerRootMethods<TContract, TContext>;

/** Recursively exposes middleware and handler attachment on every route in a core contract. */
export type ContractImplementer<
	TContract extends Contract,
	TContext extends object = EmptyObject,
> = ContractImplementerRoot<TContract, TContext>;
