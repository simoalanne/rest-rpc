import { isRouteLeaf, type Contract } from "@rest-rpc/core/contract";
import type { ContractImplementer } from "./implement.types.ts";
import type {
	RuntimeRouteHandler,
	ServerRouteBuilderState,
} from "./routeBuilder.types.ts";
import type { DefaultContext } from "./context.ts";
import { ServerRouteBuilder } from "./routeBuilder.ts";

type RuntimeRoute = { readonly "~restrpc": ServerRouteBuilderState };

type RuntimeContractTree =
	| RuntimeRoute
	| { readonly [key: string]: RuntimeContractTree };

const isContractRoute = (value: RuntimeContractTree): value is RuntimeRoute =>
	isRouteLeaf(value);

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

const mapContractRoutes = (
	contract: RuntimeContractTree,
	map: (route: RuntimeRoute) => RuntimeRoute,
): RuntimeContractTree => {
	if (isContractRoute(contract)) return map(contract);

	return Object.fromEntries(
		Object.entries(contract).map(([key, child]) => [
			key,
			mapContractRoutes(child, map),
		]),
	);
};

const appendMiddlewareToRoutes = (
	contract: RuntimeContractTree,
	middleware: RuntimeRouteHandler,
): RuntimeContractTree =>
	mapContractRoutes(contract, (route) => {
		const state = route["~restrpc"];
		return new ServerRouteBuilder({
			...state,
			middleware: [...(state.middleware ?? []), middleware],
		});
	});

const createImplementer = (contract: RuntimeContractTree): object => {
	if (isContractRoute(contract)) return contract;

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
 * @see {@link https://rest-rpc.dev/docs/contract-first}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementer<TContract, DefaultContext> {
	const runtimeContract = contract as unknown as RuntimeContractTree;
	assertUnimplementedRoutes(runtimeContract);
	return createImplementer(
		mapContractRoutes(
			runtimeContract,
			(route) => new ServerRouteBuilder(route["~restrpc"]),
		),
	) as ContractImplementer<TContract, DefaultContext>;
}
