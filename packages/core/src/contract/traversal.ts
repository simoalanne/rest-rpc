import type { Contract, RouteDeclaration } from "./route.ts";
import { isRouteDeclaration } from "./route.ts";

type Tree<T> = Record<string, unknown> | T;

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

export const mapContractRoutes = (
	contract: Contract,
	mappingFn: (route: RouteDeclaration, path: string[]) => unknown,
) => mapObjectValues(contract, isRouteDeclaration, mappingFn);

export function* contractRoutes(
	contract: Contract,
): Generator<RouteDeclaration> {
	if (isRouteDeclaration(contract)) {
		yield contract;
		return;
	}

	for (const child of Object.values(contract)) {
		yield* contractRoutes(child);
	}
}

export const flattenContractRoutes = <TContract extends Contract = Contract>(
	contract: TContract,
): RouteDeclaration[] => [...contractRoutes(contract)];
