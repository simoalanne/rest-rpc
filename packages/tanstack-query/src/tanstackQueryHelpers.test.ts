import assert from "node:assert/strict";
import { describe, it } from "node:test";
import esmock from "esmock";
import { apiContract, createApiTree } from "../test/factories.ts";

describe("createTanstackQueryHelpers", () => {
	it("creates a core client and maps HTTP routes to route APIs", async () => {
		const initClientCalls: unknown[][] = [];
		const routeApiCalls: unknown[][] = [];
		const fetchCalls = {
			listFetchResponseCalls: [] as unknown[][],
			byIdFetchResponseCalls: [] as unknown[][],
			createFetchResponseCalls: [] as unknown[][],
		};
		const module = await esmock("./tanstackQueryHelpers.ts", {
			"@rest-rpc/core": {
				initClient: (...args: unknown[]) => {
					initClientCalls.push(args);
					return createApiTree(fetchCalls);
				},
			},
			"./routeApi.ts": {
				createRouteApi: (...args: unknown[]) => {
					routeApiCalls.push(args);
					return { source: "routeApi" };
				},
			},
		});
		const api = module.createTanstackQueryHelpers(apiContract, {
			baseUrl: "http://localhost:3001",
			timeoutMs: 1000,
		});

		assert.deepEqual(initClientCalls, [
			[
				apiContract,
				{
					baseUrl: "http://localhost:3001",
					timeoutMs: 1000,
				},
			],
		]);
		assert.deepEqual(api.items.list, { source: "routeApi" });
		assert.deepEqual(api.items.byId, { source: "routeApi" });
		assert.deepEqual(api.items.create, { source: "routeApi" });
		assert.equal("socket" in api.items, false);
		assert.equal("discuss" in api, false);
		assert.equal(routeApiCalls.length, 3);
	});
});
