import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { router, routerAsync } from "./define.ts";
import { testContract } from "./factories.ts";
import { noBody } from "./route.ts";

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

	it("allows explicit no-body request declarations", () => {
		const contract = router({
			ping: {
				method: "POST",
				path: "/ping",
				request: {
					body: noBody(),
				},
				responses: {
					204: noBody(),
				},
			},
		});

		assert.deepEqual(contract.ping.request.requestKeys, {});
	});

	it("rejects reserved common content-type headers", () => {
		assert.throws(
			() =>
				router(
					{
						ping: {
							method: "GET",
							path: "/ping",
							responses: {
								204: noBody(),
							},
						},
					},
					{
						commonHeaders: {
							"content-type": z.string(),
						},
					},
				),
			/reserved header key "content-type"/,
		);
	});

	it("rejects common and route headers that differ only by case", () => {
		assert.throws(
			() =>
				router(
					{
						ping: {
							method: "GET",
							path: "/ping",
							request: {
								headers: {
									"X-Trace-ID": z.string(),
								},
							},
							responses: {
								204: noBody(),
							},
						},
					},
					{
						commonHeaders: {
							"x-trace-id": z.string(),
						},
					},
				),
			/duplicate header keys that differ only by case/,
		);
	});

	it("rejects OpenAPI response descriptions without matching responses", () => {
		assert.throws(
			() =>
				router({
					ping: {
						method: "GET",
						path: "/ping",
						openApi: {
							responseDescriptions: {
								200: "Pong.",
							},
						},
						responses: {
							204: noBody(),
						},
					},
				}),
			/response description for status 200 without a matching response schema/,
		);
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
