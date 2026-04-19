import type { Contract, ContractTree } from "../contracts.ts";

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

const isContractDefinition = <TMeta = unknown>(
	value: unknown,
): value is Contract<TMeta> =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

/**
 * Recursively maps over given `ContractTree` and applies the provided mapping
 * function to each `Contract` in the tree, preserving the tree shape.
 *
 * @param tree - The ContractTree to map over
 * @param mappingFn - The mapping function to apply to each `Contract`
 * @returns A new tree with same shape as input, but with each `Contract` replaced by the result of `mappingFn`
 */
export const mapContractTree = <TMeta = unknown>(
	tree: ContractTree<TMeta>,
	mappingFn: (contract: Contract<TMeta>) => unknown,
) => mapObjectValues(tree, isContractDefinition, mappingFn);

export type FlattenedContract<TMeta = unknown> = Contract<TMeta> & {
	keySegments: string[];
};

/**
 * Flattens a `ContractTree` into a list of `FlattenedContract` objects,
 * preserving the key segments that represent the path to each contract in the original tree.
 *
 * @param tree - The ContractTree to flatten
 * @returns An array of flattened contracts with their path information
 */
export const flattenContractTree = <
	TMeta = unknown,
	TTree extends ContractTree<TMeta> = ContractTree<TMeta>,
>(
	tree: TTree,
): FlattenedContract<TMeta>[] => {
	const result: FlattenedContract<TMeta>[] = [];

	const visit = (node: ContractTree<TMeta>, keySegments: string[]) => {
		if (isContractDefinition<TMeta>(node)) {
			result.push({
				...node,
				keySegments,
			});
			return;
		}

		Object.entries(node).forEach(([key, child]) => {
			visit(child as ContractTree<TMeta>, [...keySegments, key]);
		});
	};

	visit(tree as ContractTree<TMeta>, []);
	return result;
};
