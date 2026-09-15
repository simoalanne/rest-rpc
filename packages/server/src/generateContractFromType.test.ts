import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import { generateContractFromType } from "@rest-rpc/core/generate";
import type { api as serverApi } from "../test-fixtures/generate/server.ts";

// This suite intentionally lives in the server package instead of beside the
// core generator so its realistic fixture can depend on both public packages
// without introducing a core-to-server dependency.
describe("generateContractFromType with server routes", () => {
	const expectedContract = {
		users: {
			create: {
				"~restrpc": {
					source: "generated",
					kind: "http",
					method: "POST",
					path: "/users/:id",
					request: { contentType: "application/json" },
					responses: { 201: {}, 422: {} },
				},
			},
		},
		documents: {
			import: {
				"~restrpc": {
					source: "generated",
					kind: "procedure",
					method: "POST",
					path: "",
					request: {
						contentType: ["text/plain", "text/markdown"],
					},
					responses: { 200: {} },
				},
			},
		},
	};

	it("resolves relative entry and tsconfig paths from the working directory", () => {
		const contract = generateContractFromType({
			filePath: "test-fixtures/generate/server.ts",
			exportName: "api",
			tsconfigPath: "tsconfig.json",
		});

		assert.deepEqual(contract, expectedContract);
		assert.deepEqual(JSON.parse(JSON.stringify(contract)), contract);
	});

	for (const exportName of ["ApiTypeAlias", "ApiInterface"] as const) {
		it(`generates a contract from ${exportName}`, () => {
			const contract = generateContractFromType({
				filePath: resolve("test-fixtures/generate/server.ts"),
				exportName,
				tsconfigPath: resolve("tsconfig.json"),
			});

			assert.deepEqual(contract, expectedContract);
		});
	}

	it("finds the nearest tsconfig from an absolute entry path", async () => {
		const contract = generateContractFromType<typeof serverApi>({
			filePath: resolve("test-fixtures/generate/server.ts"),
			exportName: "api",
		});

		const client = initClient(contract, {
			baseUrl: "https://api.test",
			fetch: async () =>
				new Response(JSON.stringify({ code: "invalid_name" }), {
					status: 422,
					headers: { "content-type": "application/problem+json" },
				}),
		});
		const response = await client.users.create({
			body: { name: "" },
			params: { id: "user-1" },
		});

		assert.equal(response.status, 422);
		assert.deepEqual(response.body, { code: "invalid_name" });
	});

	for (const [exportName, expectedError] of [
		["widenedPathApi", /route "invalid" must have a literal path/],
		["widenedMethodApi", /route "invalid" must have a literal method/],
		[
			"widenedStatusApi",
			/route "invalid" must have literal numeric response statuses/,
		],
		[
			"emptyResponsesApi",
			/route "invalid" must have at least one response status/,
		],
	] as const) {
		it(`rejects ${exportName}`, () => {
			assert.throws(
				() =>
					generateContractFromType({
						filePath: resolve("test-fixtures/generate/server.ts"),
						exportName,
						tsconfigPath: resolve("tsconfig.json"),
					}),
				expectedError,
			);
		});
	}
});
