import assert from "node:assert/strict";
import { describe, it } from "node:test";
import esmock from "esmock";
import {
	apiContract,
	createApiTree,
	createQueryClientMock,
	resetQueryClientMock,
} from "../test/factories.ts";

describe("initReactQueryClient", () => {
	it("creates a core client and maps HTTP routes to route hooks", async () => {
		const initClientCalls: unknown[][] = [];
		const routeHookCalls: unknown[][] = [];
		const fetchCalls = {
			listFetchResponseCalls: [] as unknown[][],
			byIdFetchResponseCalls: [] as unknown[][],
			createFetchResponseCalls: [] as unknown[][],
		};
		const module = await esmock("./reactQueryClient.ts", {
			"@rest-rpc/core": {
				initClient: (...args: unknown[]) => {
					initClientCalls.push(args);
					return createApiTree(fetchCalls);
				},
			},
			"./routeHooks.ts": {
				createRouteHooks: (...args: unknown[]) => {
					routeHookCalls.push(args);
					return { source: "routeHooks" };
				},
			},
		});
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);

		const api = module.initReactQueryClient(apiContract, {
			queryClient: queryClient.queryClient,
			origin: "http://localhost:3001",
			timeoutMs: 1000,
		});

		assert.deepEqual(initClientCalls, [
			[
				apiContract,
				{
					origin: "http://localhost:3001",
					timeoutMs: 1000,
				},
			],
		]);
		assert.deepEqual(api.items.list, { source: "routeHooks" });
		assert.deepEqual(api.items.byId, { source: "routeHooks" });
		assert.deepEqual(api.items.create, { source: "routeHooks" });
		assert.equal("socket" in api.items, false);
		assert.equal("discuss" in api, false);
		assert.equal(routeHookCalls.length, 3);
		assert.deepEqual(
			routeHookCalls.map((call) => call[2]),
			[
				["items", "list"],
				["items", "byId"],
				["items", "create"],
			],
		);
	});
});
