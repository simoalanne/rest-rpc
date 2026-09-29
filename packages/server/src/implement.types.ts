import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import type { HandlerMethodFor } from "./routeBuilder.types.ts";

import type {
	MiddlewareRequest,
	MiddlewareReturn,
	RequestFields,
	ReusableMiddlewareRequest,
} from "./middleware.types.ts";

type EmptyObject = Record<never, never>;
type ContractRoute = { readonly "~restrpc": RouteDeclaration };

type ContractimplementerNode<
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
				/** Selects the typed per-request context store for this implementation. @see {@link https://rest-rpc.dev/docs/middleware#shared-context} */
				$context<TValues extends object>(): ContractimplementerNode<
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
				): ContractimplementerNode<
					TContract,
					TAdditionalHandlerFields,
					TContext
				>;
			}
	: {
			readonly [TKey in keyof TContract]: ContractimplementerNode<
				Extract<TContract[TKey], Contract>,
				TAdditionalHandlerFields,
				TContext
			>;
		};

type implementerRootMethods<
	TContract extends Contract,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = {
	/** Selects the typed per-request context store for this implementation tree. @see {@link https://rest-rpc.devdocs/contract-first/route-builder#context-and-middleware} */
	$context<TValues extends object>(): ContractimplementerRoot<
		TContract,
		TAdditionalHandlerFields,
		TValues
	>;
	/** Applies middleware to each route in this implementation tree. @see {@link https://rest-rpc.devdocs/contract-first/route-builder#context-and-middleware} */
	use(
		middleware: (
			request: ReusableMiddlewareRequest<
				RequestFields,
				TAdditionalHandlerFields,
				TContext
			>,
		) => MiddlewareReturn,
	): ContractimplementerRoot<TContract, TAdditionalHandlerFields, TContext>;
};

type ContractimplementerRoot<
	TContract extends Contract,
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = TContract extends ContractRoute
	? ContractimplementerNode<TContract, TAdditionalHandlerFields, TContext>
	: {
			readonly [
				TKey in Exclude<keyof TContract, "use" | "$context">
			]: ContractimplementerNode<
				Extract<TContract[TKey], Contract>,
				TAdditionalHandlerFields,
				TContext
			>;
		} & implementerRootMethods<TContract, TAdditionalHandlerFields, TContext>;

/** Recursively exposes middleware and handler attachment on every route in a core contract. */
export type Contractimplementer<
	TContract extends Contract,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = ContractimplementerRoot<TContract, TAdditionalHandlerFields, TContext>;
