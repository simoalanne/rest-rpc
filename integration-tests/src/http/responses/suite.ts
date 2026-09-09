import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { responsesContract } from "./contract.ts";

type ResponsesClient = ReturnType<typeof initClient<typeof responsesContract>>;

type ResponsesSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

export const runResponsesSuite = (adapter: ResponsesSuiteAdapter) => {
	describe(`${adapter.name} responses integration`, () => {
		let server: StartedServer;
		let client: ResponsesClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(responsesContract, { baseUrl: server.origin });
		});

		after(async () => {
			await server.close();
		});

		it("returns undeclared runtime responses untouched", async () => {
			const response = await client.undeclared();

			assert.equal(response.status, 418);
			assert.equal(response.rawResponse.bodyUsed, false);
			assert.deepEqual(await response.rawResponse.json(), {
				code: "TEAPOT",
				message: "undeclared response",
			});
		});

		it("routes declared response validation failures through custom error handling", async () => {
			const response = await client.invalidDeclared();

			assert.equal(response.status, 500);
			assert.equal(
				response.rawResponse.headers.get("x-error-handler"),
				"response-validation",
			);
			assert.deepEqual(await response.rawResponse.json(), {
				code: "INVALID_RESPONSE",
				path: "/responses/invalid-declared",
			});
		});
	});
};
