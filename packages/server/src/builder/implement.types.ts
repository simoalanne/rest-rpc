import type { Contract, RouteDefinition } from "@rest-rpc/core/contract";
import type { HandlerMethodFor } from "./routeBuilder.ts";
import type {
	MiddlewareRequest,
	MiddlewareReturn,
	RequestFields,
	ReusableMiddlewareRequest,
} from "./routeBuilder.types.ts";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type { WithDefaultContext } from "./context.ts";

type ContractRoute = { readonly "~restrpc": RouteDefinition };

type ContractImplementerNode<
	TContract extends Contract,
	TContext extends object,
> = TContract extends ContractRoute
	? {
			readonly "~restrpc": TContract["~restrpc"] & {
				readonly context?: TContext;
			};
		} & HandlerMethodFor<TContract["~restrpc"], TContext> & {
				/** Selects the typed per-request context store for this implementation, merged with `DefaultContext`. @see {@link https://rest-rpc.vercel.app/docs/context} */
				$context<TValues extends object>(): ContractImplementerNode<
					TContract,
					WithDefaultContext<TValues>
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

type ImplementerRootMethods<
	TContract extends Contract,
	TContext extends object,
> = {
	/** Selects the typed per-request context store for this implementation tree, merged with `DefaultContext`. @see {@link https://rest-rpc.vercel.app/docs/context} */
	$context<TValues extends object>(): ContractImplementerRoot<
		TContract,
		WithDefaultContext<TValues>
	>;
	/** Applies middleware to each route in this implementation tree. @see {@link https://rest-rpc.vercel.app/docs/middleware} */
	use(
		middleware: (
			request: ReusableMiddlewareRequest<RequestFields, TContext>,
		) => MiddlewareReturn,
	): ContractImplementerRoot<TContract, TContext>;
};

type ContractImplementerRoot<
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
