import type { Contract, RouteDeclaration } from "./contract.ts";

type Tree<T> = Record<string, unknown> | T;
export type ContractRouteEntry = {
	route: RouteDeclaration;
	path: string[];
};

export const mapObjectValues = <TLeaf>(
	tree: Tree<TLeaf>,
	isLeaf: (value: unknown) => value is TLeaf,
	mappingFn: (value: TLeaf, path: string[]) => unknown,
	path: string[] = [],
): unknown =>
	isLeaf(tree)
		? mappingFn(tree, path)
		: Object.entries(tree).reduce(
				(acc, [k, v]) => {
					acc[k] = mapObjectValues(v as Tree<TLeaf>, isLeaf, mappingFn, [
						...path,
						k,
					]);
					return acc;
				},
				{} as Record<string, unknown>,
			);

const isRouteDeclaration = (value: unknown): value is RouteDeclaration => {
	return (
		typeof value === "object" &&
		value !== null &&
		"path" in value &&
		"method" in value
	);
};

export const mapContractRoutes = (
	contract: Contract,
	mappingFn: (route: RouteDeclaration, path: string[]) => unknown,
) => mapObjectValues(contract, isRouteDeclaration, mappingFn);

export function* contractRouteEntries(
	contract: Contract,
	path: string[] = [],
): Generator<ContractRouteEntry> {
	if (isRouteDeclaration(contract)) {
		yield { route: contract, path };
		return;
	}

	for (const [key, child] of Object.entries(contract)) {
		yield* contractRouteEntries(child, [...path, key]);
	}
}

export function* contractRoutes(contract: Contract) {
	for (const { route } of contractRouteEntries(contract)) {
		yield route;
	}
}

export const flattenContractRoutes = <TContract extends Contract = Contract>(
	contract: TContract,
): RouteDeclaration[] => [...contractRoutes(contract)];
