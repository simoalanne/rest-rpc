import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { responsesContract } from "./contract.ts";

type ResponsesClient = ReturnType<typeof initClient<typeof responsesContract>>;

type MiddlewareSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

export const runResponseMiddlewareHeadersSuite = (
	adapter: MiddlewareSuiteAdapter,
	expectedHeaders: Record<string, string>,
) => {
	describe(`${adapter.name} response middleware headers integration`, () => {
		let server: StartedServer;
		let client: ResponsesClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(responsesContract, { baseUrl: server.origin });
		});

		after(async () => {
			await server.close();
		});

		it("preserves headers written by framework middleware", async () => {
			const response = await client.jsonContentType.fetchResponse();

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			for (const [name, value] of Object.entries(expectedHeaders)) {
				assert.equal(response.headers.get(name), value);
			}
			assert.deepEqual(response.body, { ok: true });
		});
	});
};
