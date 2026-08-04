import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { defineContract, defineContractAsync } from "./define.ts";
import { testContract } from "./factories.ts";

describe("defineContract", () => {
	it("normalizes and validates contracts", () => {
		const contract = defineContract(
			testContract({
				path: "/search/:id",
				request: {
					params: z.object({ id: z.string() }),
				},
			}),
			{ pathPrefix: "/api" },
		);

		assert.equal(contract.search.find.path, "/api/search/:id");
		assert.deepEqual(contract.search.find.request.requestKeys, {
			id: "params",
		});
	});

	it("rejects async request key resolution", () => {
		assert.throws(
			() =>
				defineContract(
					testContract({
						request: {
							query: z.string(),
						},
					}),
					{
						resolveRequestKeys: async () => ["q"],
					},
				),
			/use defineContractAsync/i,
		);
	});

	it("allows validation to be deferred to a parent contract", () => {
		const child = defineContract(
			{
				find: testContract({
					request: {
						query: z.string(),
					},
				}).search.find,
			},
			{ validate: false },
		);

		const contract = defineContract(
			{ search: child },
			{
				resolveRequestKeys: () => ["q"],
			},
		);

		assert.deepEqual(contract.search.find.request.requestKeys, {
			q: "query",
		});
	});
});

describe("defineContractAsync", () => {
	it("normalizes and validates contracts with async request key resolution", async () => {
		const contract = await defineContractAsync(
			testContract({
				request: {
					query: z.string(),
				},
			}),
			{
				pathPrefix: "/api",
				resolveRequestKeys: async () => ["q"],
			},
		);

		assert.equal(contract.search.find.path, "/api/search");
		assert.deepEqual(contract.search.find.request.requestKeys, {
			q: "query",
		});
	});
});
