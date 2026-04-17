import type { Contract, ContractTree } from "../contracts.ts";
import { mapObjectValues } from "./mapObjectValues.ts";

const isContractDefinition = (value: unknown): value is Contract =>
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
export const mapContractTree = (
	tree: ContractTree,
	mappingFn: (contract: Contract) => unknown,
) => mapObjectValues(tree, isContractDefinition, mappingFn);

export type FlattenedContract = Contract & {
	keySegments: string[];
};

/**
 * Flattens a `ContractTree` into a list of `FlattenedContract` objects,
 * preserving the key segments that represent the path to each contract in the original tree.
 *
 * @param tree - The ContractTree to flatten
 * @returns An array of flattened endpoints with their path information
 */
export const flattenContractTree = (
	tree: ContractTree,
): FlattenedContract[] => {
	const result: FlattenedContract[] = [];

	const visit = (node: ContractTree, keySegments: string[]) => {
		if (isContractDefinition(node)) {
			result.push({
				...node,
				keySegments,
			});
			return;
		}

		Object.entries(node).forEach(([key, child]) => {
			visit(child as ContractTree, [...keySegments, key]);
		});
	};

	visit(tree, []);
	return result;
};
