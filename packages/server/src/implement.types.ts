import type { Contract, RouteDeclaration } from "@rest-rpc/core/contract";
import type { HandlerMethodFor } from "./routeBuilder.types.ts";

import type {
	MiddlewareRequest,
	MiddlewareReturn,
} from "./middleware.types.ts";

type EmptyObject = Record<never, never>;
type ContractRoute = { readonly "~restrpc": RouteDeclaration };

/** Recursively exposes middleware and handler attachment on every route in a core contract. */
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
			> & {
				/** Wraps this contract leaf with middleware. @see {@link https://rest-rpc.dev/docs/middleware} */
				use(
					middleware: (
						request: MiddlewareRequest<
							TContract["~restrpc"],
							TAdditionalHandlerFields,
							TContext
						>,
					) => MiddlewareReturn,
				): ContractImplementor<TContract, TAdditionalHandlerFields, TContext>;
			}
	: {
			readonly [TKey in keyof TContract]: ContractImplementor<
				Extract<TContract[TKey], Contract>,
				TAdditionalHandlerFields,
				TContext
			>;
		};
