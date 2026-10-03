import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import type { HandlerMethodFor } from "./routeBuilder.types.ts";

import type {
	MiddlewareRequest,
	MiddlewareReturn,
	RequestFields,
	ReusableMiddlewareRequest,
} from "./middleware.types.ts";
import type { EmptyObject } from "./typeUtils.ts";

type ContractRoute = { readonly "~restrpc": RouteDeclaration };

type ContractImplementerNode<
	TContract extends Contract,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = TContract extends ContractRoute
	? {
			readonly "~restrpc": TContract["~restrpc"];
		} & HandlerMethodFor<
			TContract["~restrpc"],
			TAdditionalHandlerFields,
			TContext
		> & {
				/** Selects the typed per-request context store for this implementation. @see {@link https://rest-rpc.dev/docs/context} */
				$context<TValues extends object>(): ContractImplementerNode<
					TContract,
					TAdditionalHandlerFields,
					TValues
				>;
				/** Wraps this contract leaf with middleware. @see {@link https://rest-rpc.dev/docs/middleware} */
				use(
					middleware: (
						request: MiddlewareRequest<
							TContract["~restrpc"],
							TAdditionalHandlerFields,
							TContext
						>,
					) => MiddlewareReturn,
				): ContractImplementerNode<
					TContract,
					TAdditionalHandlerFields,
					TContext
				>;
			}
	: {
			readonly [TKey in keyof TContract]: ContractImplementerNode<
				Extract<TContract[TKey], Contract>,
				TAdditionalHandlerFields,
				TContext
			>;
		};

type ImplementerRootMethods<
	TContract extends Contract,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = {
	/** Selects the typed per-request context store for this implementation tree. @see {@link https://rest-rpc.dev/docs/context} */
	$context<TValues extends object>(): ContractImplementerRoot<
		TContract,
		TAdditionalHandlerFields,
		TValues
	>;
	/** Applies middleware to each route in this implementation tree. @see {@link https://rest-rpc.dev/docs/middleware} */
	use(
		middleware: (
			request: ReusableMiddlewareRequest<
				RequestFields,
				TAdditionalHandlerFields,
				TContext
			>,
		) => MiddlewareReturn,
	): ContractImplementerRoot<TContract, TAdditionalHandlerFields, TContext>;
};

type ContractImplementerRoot<
	TContract extends Contract,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = TContract extends ContractRoute
	? ContractImplementerNode<TContract, TAdditionalHandlerFields, TContext>
	: {
			readonly [
				TKey in Exclude<keyof TContract, "use" | "$context">
			]: ContractImplementerNode<
				Extract<TContract[TKey], Contract>,
				TAdditionalHandlerFields,
				TContext
			>;
		} & ImplementerRootMethods<TContract, TAdditionalHandlerFields, TContext>;

/** Recursively exposes middleware and handler attachment on every route in a core contract. */
export type ContractImplementer<
	TContract extends Contract,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = ContractImplementerRoot<TContract, TAdditionalHandlerFields, TContext>;
