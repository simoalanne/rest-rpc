import assert from "node:assert/strict";
import { describe, it } from "node:test";
import esmock from "esmock";
import {
	apiContract,
	createApiTree,
	createQueryClientMock,
	resetQueryClientMock,
} from "./factories.ts";

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
			"@contract-first-api/core": {
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
			baseUrl: "http://localhost:3001/api",
			timeoutMs: 1000,
		});

		assert.deepEqual(initClientCalls, [
			[
				apiContract,
				{
					baseUrl: "http://localhost:3001/api",
					timeoutMs: 1000,
				},
			],
		]);
		assert.deepEqual(api.items.list, { source: "routeHooks" });
		assert.deepEqual(api.items.byId, { source: "routeHooks" });
		assert.deepEqual(api.items.create, { source: "routeHooks" });
		assert.deepEqual(api.items.socket, {});
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
