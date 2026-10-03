import type { Contract } from "@rest-rpc/core/contract";
import { implement } from "./implement.ts";
import type { ContractImplementer } from "./implement.types.ts";
import { serverRoute } from "./routeBuilder.ts";
import type { PublicServerRouteBuilder } from "./routeBuilder.types.ts";

/** The route builder and contract implementer typed with an adapter's handler fields and context. */
export type AdapterApi<
	TAdditionalHandlerFields extends object,
	TContext extends object,
> = {
	route: PublicServerRouteBuilder<TAdditionalHandlerFields, TContext>;
	implement<const TContract extends Contract>(
		contract: TContract,
	): ContractImplementer<TContract, TAdditionalHandlerFields, TContext>;
};

/**
 * Types the server route builder and `implement` with an adapter's handler
 * fields and context.
 *
 * @remarks Handler fields are supplied by the adapter at runtime, so this only
 * changes types.
 */
export function createAdapterApi<
	TAdditionalHandlerFields extends object,
	TContext extends object,
>(): AdapterApi<TAdditionalHandlerFields, TContext> {
	return { route: serverRoute, implement } as unknown as AdapterApi<
		TAdditionalHandlerFields,
		TContext
	>;
}
