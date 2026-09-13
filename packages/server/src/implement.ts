import type { Contract } from "@rest-rpc/core/contract";
import type { ContractImplementor } from "./implement.types.ts";
import "./routeBuilder.ts";

/** Exposes handler attachment on every route in a core contract. */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract> {
	return contract as ContractImplementor<TContract>;
}
