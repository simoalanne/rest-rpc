import { ApiClient } from "@contract-first-api/api-client";
import type { Contract } from "@contract-first-api/core";
import createAdapter, {
	type MutationFunctions,
	mapWrappedContracts,
	type QueryFunctions,
} from "@contract-first-api/react-query";
import { allContracts, type ExampleContractMeta } from "@example/shared";
import { QueryClient } from "@tanstack/react-query";

const baseUrl = `${
	(import.meta.env.VITE_API_URL as string | undefined) ??
	"http://localhost:3001"
}/api`;

const client = new ApiClient({
	baseUrl,
	contracts: allContracts,
});

export const queryClient = new QueryClient();
const defaultAdapter = createAdapter(client.api, queryClient);

type CustomWrappedNode<E extends Contract> = E extends {
	meta: { reactQuery: { safe: true } };
}
	? QueryFunctions<E>
	: E["method"] extends "GET"
		? QueryFunctions<E>
		: MutationFunctions<E>;

type CustomAdapter<T> = {
	[K in keyof T]: T[K] extends {
		$contract: infer E extends Contract<ExampleContractMeta>;
	}
		? CustomWrappedNode<E>
		: T[K] extends Record<string, unknown>
			? CustomAdapter<T[K]>
			: never;
};

export const api = mapWrappedContracts<ExampleContractMeta, typeof client.api>(
	defaultAdapter,
	(node) =>
		node.$contract.meta?.reactQuery?.safe || node.$contract.method === "GET"
			? node.$reactQueryApi
			: node,
) as CustomAdapter<typeof defaultAdapter>;
