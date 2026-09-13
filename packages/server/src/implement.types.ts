import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import type { HandlerMethodFor } from "./routeBuilder.types.ts";

type EmptyObject = Record<never, never>;
type ContractRoute = { readonly "~restrpc": RouteDeclaration };

/** Recursively exposes handler attachment on every route in a core contract. */
export type ContractImplementor<
	TContract extends Contract,
	TAdditionalHandlerFields extends object = EmptyObject,
	TContext extends object = EmptyObject,
> = TContract extends ContractRoute
	? TContract &
			HandlerMethodFor<
				TContract["~restrpc"],
				TAdditionalHandlerFields,
				TContext
			>
	: {
			readonly [TKey in keyof TContract]: ContractImplementor<
				Extract<TContract[TKey], Contract>,
				TAdditionalHandlerFields,
				TContext
			>;
		};
