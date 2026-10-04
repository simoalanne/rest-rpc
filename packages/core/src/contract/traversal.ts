import type { Contract, RouteDeclaration, RouteTree } from "./contract.ts";
import { resolveRoutePath } from "./path.ts";

type Tree<T> = Record<string, unknown> | T;
export type ContractRouteEntry = {
	route: RouteDeclaration & { path: string };
	path: string[];
};

const mapObjectValues = <TLeaf>(
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

/** Detects a route leaf in a contract or implementation tree. */
export const isRouteLeaf = (
	value: unknown,
): value is { readonly "~restrpc": RouteDeclaration } =>
	typeof value === "object" && value !== null && "~restrpc" in value;

export const mapContractRoutes = (
	contract: Contract,
	mappingFn: (route: RouteDeclaration, path: string[]) => unknown,
) =>
	mapObjectValues<{ readonly "~restrpc": RouteDeclaration }>(
		contract,
		isRouteLeaf,
		(route, path) => mappingFn(route["~restrpc"], path),
	);

export function* contractRouteEntries(
	contract: RouteTree,
	path: string[] = [],
): Generator<ContractRouteEntry> {
	if (isRouteLeaf(contract)) {
		const declaration = contract["~restrpc"];
		const route = {
			...declaration,
			path: resolveRoutePath(declaration, path),
		};
		yield { route, path };
		return;
	}

	for (const [key, child] of Object.entries(contract)) {
		yield* contractRouteEntries(child, [...path, key]);
	}
}
