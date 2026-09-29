import type { Contract } from "@rest-rpc/core/contract";
import type { ContractImplementor } from "./implement.types.ts";
import type {
	RuntimeRouteHandler,
	RuntimeServerRoute,
} from "./routeBuilder.types.ts";
import "./routeBuilder.ts";

type RuntimeContractTree =
	| RuntimeServerRoute
	| { readonly [key: string]: RuntimeContractTree };

const isContractRoute = (
	value: RuntimeContractTree,
): value is RuntimeServerRoute => "~restrpc" in value;

const assertUnimplementedRoutes = (contract: RuntimeContractTree): void => {
	if (isContractRoute(contract)) {
		const state = contract["~restrpc"];
		if (state.handler !== undefined) {
			throw new Error("Cannot implement a route that already has a handler.");
		}
		if ((state.middleware?.length ?? 0) > 0) {
			throw new Error("Cannot implement a route that already has middleware.");
		}
		return;
	}

	for (const child of Object.values(contract)) {
		assertUnimplementedRoutes(child);
	}
};

const appendMiddlewareToRoutes = (
	contract: RuntimeContractTree,
	middleware: RuntimeRouteHandler,
): RuntimeContractTree => {
	if (isContractRoute(contract)) {
		const state = contract["~restrpc"];
		return contract.clone({
			...state,
			middleware: [...(state.middleware ?? []), middleware],
		});
	}

	return Object.fromEntries(
		Object.entries(contract).map(([key, child]) => [
			key,
			appendMiddlewareToRoutes(child, middleware),
		]),
	);
};

const createImplementor = (contract: RuntimeContractTree): object => {
	if (isContractRoute(contract)) return contract;

	return {
		...contract,
		$context() {
			return this;
		},
		use(callback: RuntimeRouteHandler) {
			return createImplementor(appendMiddlewareToRoutes(contract, callback));
		},
	};
};

/** Exposes handler attachment on every route in a core contract. */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract> {
	const runtimeContract = contract as unknown as RuntimeContractTree;
	assertUnimplementedRoutes(runtimeContract);
	return createImplementor(
		runtimeContract,
	) as unknown as ContractImplementor<TContract>;
}
