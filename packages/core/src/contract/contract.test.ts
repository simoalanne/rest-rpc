import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { testContract } from "../../test/factories/contract.ts";
import { router } from "./contract.ts";
import { noBody } from "./response.ts";

describe("router", () => {
	it("normalizes and validates contracts", () => {
		const contract = router(
			testContract({
				path: "/search/:id",
				pathParams: z.object({ id: z.string() }),
			}),
			{ pathPrefix: "/api" },
		);

		assert.equal(contract.search.find.path, "/api/search/:id");
		assert.deepEqual(contract.search.find.requestKeys, {
			id: "pathParams",
		});
	});

	it("infers missing path param declarations from route paths", () => {
		const contract = router({
			todos: {
				get: {
					method: "GET",
					path: "/orgs/{orgId}/todos/:id/something/:other",
					query: z.object({ includeDone: z.boolean().optional() }),
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(contract.todos.get.requestKeys, {
			id: "pathParams",
			includeDone: "query",
			orgId: "pathParams",
			other: "pathParams",
		});
		assert.equal(typeof contract.todos.get.pathParams, "object");
		assert.equal(
			contract.todos.get.pathParams?.id?.["~standard"].vendor,
			"rest-rpc",
		);
	});

	it("rejects path params in router path prefixes", () => {
		assert.throws(
			() =>
				router(
					{
						todos: {
							list: {
								method: "GET",
								path: "/todos",
								responses: {
									204: noBody(),
								},
							},
						},
					},
					{ pathPrefix: "/orgs/:orgId" },
				),
			/pathPrefix cannot include path params/,
		);
	});

	it("allows validation to be deferred to a parent contract", () => {
		const child = router(
			{
				find: testContract({
					query: z.string(),
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

		assert.deepEqual(contract.search.find.requestKeys, {
			q: "query",
		});
	});

	it("allows explicit no-body request declarations", () => {
		const contract = router({
			ping: {
				method: "POST",
				path: "/ping",
				body: noBody(),
				responses: {
					204: noBody(),
				},
			},
		});

		assert.deepEqual(contract.ping.requestKeys, {});
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
							headers: {
								"X-Trace-ID": z.string(),
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
