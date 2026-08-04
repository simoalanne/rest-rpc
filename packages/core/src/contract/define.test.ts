import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { router, routerAsync } from "./define.ts";
import { testContract } from "./factories.ts";

describe("router", () => {
	it("normalizes and validates contracts", () => {
		const contract = router(
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
				router(
					testContract({
						request: {
							query: z.string(),
						},
					}),
					{
						resolveRequestKeys: async () => ["q"],
					},
				),
			/use routerAsync/i,
		);
	});

	it("allows validation to be deferred to a parent contract", () => {
		const child = router(
			{
				find: testContract({
					request: {
						query: z.string(),
					},
				}).search.find,
			},
			{ validate: false },
		);

		const contract = router(
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

describe("routerAsync", () => {
	it("normalizes and validates contracts with async request key resolution", async () => {
		const contract = await routerAsync(
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
