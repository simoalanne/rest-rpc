import type { Contract } from "./contract.ts";
import type { RouteDefinition } from "./routeDefinition.ts";
import { resolveRoutePath } from "./path.ts";

type Tree<T> = Record<string, unknown> | T;
export type ContractRouteEntry = {
	route: RouteDefinition & { path: string };
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

export const isRouteLeaf = (
	value: unknown,
): value is { readonly "~restrpc": RouteDefinition } =>
	typeof value === "object" && value !== null && "~restrpc" in value;

export const mapContractRoutes = (
	contract: Contract,
	mappingFn: (route: RouteDefinition, path: string[]) => unknown,
) =>
	mapObjectValues<{ readonly "~restrpc": RouteDefinition }>(
		contract,
		isRouteLeaf,
		(route, path) => mappingFn(route["~restrpc"], path),
	);

export function* contractRouteEntries(
	contract: Contract,
	path: string[] = [],
): Generator<ContractRouteEntry> {
	if (isRouteLeaf(contract)) {
		const definition = contract["~restrpc"];
		const route = {
			...definition,
			path: resolveRoutePath(definition, path),
		};
		yield { route, path };
		return;
	}

	for (const [key, child] of Object.entries(contract)) {
		yield* contractRouteEntries(child, [...path, key]);
	}
}
