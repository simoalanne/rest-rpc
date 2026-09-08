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

		it("returns undeclared runtime response status and body", async () => {
			const response = await client.undeclared.fetchResponse();

			assert.equal(response.declared, false);
			assert.equal(response.status, 418);
			assert.deepEqual(response.body, {
				code: "TEAPOT",
				message: "undeclared response",
			});
		});

		it("routes declared response validation failures through custom error handling", async () => {
			const response = await client.invalidDeclared.fetchResponse();

			assert.equal(response.declared, false);
			assert.equal(response.status, 500);
			assert.equal(
				response.headers.get("x-error-handler"),
				"response-validation",
			);
			assert.deepEqual(response.body, {
				code: "INVALID_RESPONSE",
				path: "/responses/invalid-declared",
			});
		});
	});
};
