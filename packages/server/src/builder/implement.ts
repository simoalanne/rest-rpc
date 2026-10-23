import {
	isRouteLeaf,
	mapContractRoutes,
	type Contract,
} from "@rest-rpc/core/contract";
import type { ContractImplementer } from "./implement.types.ts";
import type {
	RuntimeRouteHandler,
	ServerRouteBuilderState,
} from "./routeBuilder.types.ts";
import type { DefaultContext } from "./context.ts";
import { ServerRouteBuilder } from "./routeBuilder.ts";

const assertUnimplementedRoutes = (contract: Contract): void => {
	if (isRouteLeaf(contract)) {
		const state: ServerRouteBuilderState = contract["~restrpc"];
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
	contract: Contract,
	middleware: RuntimeRouteHandler,
): Contract =>
	mapContractRoutes(contract, (declaration) => {
		const state: ServerRouteBuilderState = declaration;
		return new ServerRouteBuilder({
			...state,
			middleware: [...(state.middleware ?? []), middleware],
		});
	}) as Contract;

const createImplementer = (contract: Contract): object => {
	if (isRouteLeaf(contract)) return contract;

	return {
		...contract,
		$context() {
			return this;
		},
		use(callback: RuntimeRouteHandler) {
			return createImplementer(appendMiddlewareToRoutes(contract, callback));
		},
	};
};

/**
 * Converts a contract into an implementer, used to implement each route in the contract in type-safe way.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/contract-first}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementer<TContract, DefaultContext> {
	assertUnimplementedRoutes(contract);
	return createImplementer(
		mapContractRoutes(
			contract,
			(declaration) => new ServerRouteBuilder(declaration),
		) as Contract,
	) as ContractImplementer<TContract, DefaultContext>;
}
