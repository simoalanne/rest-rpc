import type { Contract, RouteTree } from "@rest-rpc/core/contract";
import { createAdapterApi } from "./adapterApi.ts";
import type { ContractImplementer } from "./implement.types.ts";
import type { DefaultContext } from "./index.ts";
import type { RouteHandlerFor } from "./routeBuilder.types.ts";

type RuntimeHandlerFields = {
	signal: AbortSignal;
};

const runtimeApi = createAdapterApi<RuntimeHandlerFields, DefaultContext>();

/**
 * Infers the handler signature for a route declaration.
 *
 * @remarks Use a route declared without `.handler()` to write its handler
 * separately. Pass a route tree to infer a matching tree of handler types.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-server-handler}
 */
export type InferServerHandler<TRoute extends RouteTree> = RouteHandlerFor<
	TRoute,
	RuntimeHandlerFields,
	DefaultContext
>;

/**
 * Entry point for declaring routes with handlers.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`. Routes are runtime-independent: the same route works
 * with the Fetch and Node HTTP handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 */
export const route = runtimeApi.route;

/**
 * Creates typed handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/contract-first}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementer<TContract, RuntimeHandlerFields, DefaultContext> {
	return runtimeApi.implement(contract);
}
