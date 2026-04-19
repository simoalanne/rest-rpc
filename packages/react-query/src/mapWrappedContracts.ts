import type { Contract } from "@contract-first-api/core";
import { mapObjectValues } from "@contract-first-api/core";
import type {
	AllFunctions,
	MutationFunctions,
	QueryFunctions,
	WrapContracts,
} from "./types.ts";

type WrappedLeaf =
	| (QueryFunctions<Contract> & {
			$reactQueryApi: AllFunctions<Contract>;
	  })
	| (MutationFunctions<Contract> & {
			$reactQueryApi: AllFunctions<Contract>;
	  });

type WrappedLeafForMeta<TMeta> =
	| (QueryFunctions<Contract<TMeta>> & {
			$reactQueryApi: AllFunctions<Contract<TMeta>>;
	  })
	| (MutationFunctions<Contract<TMeta>> & {
			$reactQueryApi: AllFunctions<Contract<TMeta>>;
	  });

const isWrappedContractNode = (value: unknown): value is WrappedLeaf =>
	typeof value === "object" &&
	value !== null &&
	"$fetch" in value &&
	"$tryFetch" in value;

export const mapWrappedContracts = <TMeta = unknown, T = unknown, R = unknown>(
	tree: WrapContracts<T>,
	mappingFn: (node: WrappedLeafForMeta<TMeta>, path: string[]) => R,
) =>
	mapObjectValues(
		tree as Record<string, unknown>,
		isWrappedContractNode,
		mappingFn as (node: WrappedLeaf, path: string[]) => R,
	);
