import assert from "node:assert/strict";
import { describe, it } from "node:test";
import createAdapter from "./createAdapter.ts";
import { mapWrappedContracts } from "./mapWrappedContracts.ts";

const createQueryClientMock = () => ({
	invalidateQueries: async () => {},
	cancelQueries: () => {},
	removeQueries: () => {},
	setQueryData: () => {},
	setQueriesData: () => {},
});

const createApiTree = () =>
	({
		items: {
			list: {
				ctx: {
					method: "GET",
					path: "/items",
					meta: {
						reactQuery: {
							safe: true,
						},
					},
				},
				fetch: async () => ({ items: ["carrot"] }),
			},
			search: {
				ctx: {
					method: "POST",
					path: "/items/search",
					meta: {
						reactQuery: {
							safe: true,
						},
					},
					request: { body: { shape: { term: true } } },
				},
				fetch: async () => ({ items: ["carrot"] }),
			},
			create: {
				ctx: {
					method: "POST",
					path: "/items",
					request: { body: { shape: { name: true } } },
				},
				fetch: async () => ({ created: true }),
			},
		},
	}) as const;

describe("mapWrappedContracts", () => {
	it("should support metadata-driven post-processing on top of the default adapter", () => {
		type ReactQueryMeta = {
			reactQuery?: {
				safe?: boolean;
			};
		};

		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as never,
		);

		const mapped = mapWrappedContracts<
			ReactQueryMeta,
			ReturnType<typeof createApiTree>
		>(wrapped, (node) => {
			const contract = node.$contract;
			return contract.meta?.reactQuery?.safe || contract.method === "GET"
				? node.$reactQueryApi
				: node;
		});

		assert.equal("useQuery" in mapped.items.list, true);
		assert.equal("useMutation" in mapped.items.list, true);
		assert.equal("useQuery" in mapped.items.search, true);
		assert.equal("useMutation" in mapped.items.search, true);
		assert.equal("useQuery" in mapped.items.create, false);
		assert.equal("useMutation" in mapped.items.create, true);
	});
});
