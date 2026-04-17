import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ContractTree } from "../contracts.ts";
import {
	flattenContractTree,
	mapContractTree,
} from "./endpointTransformers.ts";

describe("Contract Transformers", () => {
	describe("flattenContractTree", () => {
		it("should return a single contract with empty keySegments when tree is a contract", () => {
			const endpoint: ContractTree = {
				method: "GET",
				path: "/health",
			};

			const flattened = flattenContractTree(endpoint);

			assert.equal(flattened.length, 1);
			assert.deepStrictEqual(flattened[0], {
				method: "GET",
				path: "/health",
				keySegments: [],
			});
		});

		it("should flatten nested contract trees and preserve key segment paths", () => {
			const tree: ContractTree = {
				producers: {
					byId: {
						method: "GET",
						path: "/producers/:id",
					},
				},
				orders: {
					create: {
						method: "POST",
						path: "/orders",
					},
				},
			};

			const flattened = flattenContractTree(tree);

			assert.equal(flattened.length, 2);
			assert.deepStrictEqual(flattened, [
				{
					method: "GET",
					path: "/producers/:id",
					keySegments: ["producers", "byId"],
				},
				{
					method: "POST",
					path: "/orders",
					keySegments: ["orders", "create"],
				},
			]);
		});

		it("should preserve contract fields when flattening", () => {
			const tree: ContractTree = {
				secured: {
					method: "DELETE",
					path: "/account",
				},
			};

			const [endpoint] = flattenContractTree(tree);

			assert.equal(endpoint.method, "DELETE");
			assert.equal(endpoint.path, "/account");
			assert.deepStrictEqual(endpoint.keySegments, ["secured"]);
		});

		it("should return an empty list for an empty tree", () => {
			const flattened = flattenContractTree({});
			assert.deepStrictEqual(flattened, []);
		});
	});

	describe("mapContractTree", () => {
		it("should map a single contract when tree is a contract", () => {
			const endpoint: ContractTree = {
				method: "PATCH",
				path: "/profile",
			};

			const mapped = mapContractTree(
				endpoint,
				(def) => `${def.method} ${def.path}`,
			);

			assert.equal(mapped, "PATCH /profile");
		});

		it("should map all endpoints and preserve nested tree shape", () => {
			const tree: ContractTree = {
				producers: {
					list: {
						method: "GET",
						path: "/producers",
					},
					byId: {
						method: "GET",
						path: "/producers/:id",
					},
				},
				orders: {
					create: {
						method: "POST",
						path: "/orders",
					},
				},
			};

			const mapped = mapContractTree(tree, (def) => ({
				label: `${def.method} ${def.path}`,
			}));

			assert.deepStrictEqual(mapped, {
				producers: {
					list: { label: "GET /producers" },
					byId: { label: "GET /producers/:id" },
				},
				orders: {
					create: { label: "POST /orders" },
				},
			});
		});

		it("should not mutate original contract tree when mapping", () => {
			const tree: ContractTree = {
				users: {
					me: {
						method: "GET",
						path: "/users/me",
					},
				},
			};

			void mapContractTree(tree, (def) => ({
				...def,
				path: "/changed",
			}));

			assert.deepStrictEqual(tree, {
				users: {
					me: {
						method: "GET",
						path: "/users/me",
					},
				},
			});
		});
	});
});
