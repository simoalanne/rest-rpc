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

export const isContractRouteDeclaration = (
	value: unknown,
): value is { readonly "~restrpc": RouteDeclaration } => {
	return typeof value === "object" && value !== null && "~restrpc" in value;
};

export const mapContractRoutes = (
	contract: Contract,
	mappingFn: (route: RouteDeclaration, path: string[]) => unknown,
) =>
	mapObjectValues<{ readonly "~restrpc": RouteDeclaration }>(
		contract,
		isContractRouteDeclaration,
		(route, path) => mappingFn(route["~restrpc"], path),
	);

export function* contractRouteEntries(
	contract: Contract,
	path: string[] = [],
): Generator<ContractRouteEntry> {
	if (isContractRouteDeclaration(contract)) {
		const declaration = contract["~restrpc"];
		const route: RouteDeclaration =
			declaration.kind === "procedure"
				? { ...declaration, path: `/${path.join("/")}` }
				: declaration;
		yield { route, path };
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
