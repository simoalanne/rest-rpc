import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../harness/listen.ts";

type ResponsesSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

export const runResponsesSuite = (adapter: ResponsesSuiteAdapter) => {
	describe(`${adapter.name} responses integration`, () => {
		let server: StartedServer;

		before(async () => {
			server = await adapter.start();
		});

		after(async () => {
			await server.close();
		});

		it("routes declared response validation failures through custom error handling", async () => {
			const response = await fetch(
				`${server.origin}/responses/invalid-declared`,
			);

			assert.equal(response.status, 500);
			assert.equal(
				response.headers.get("x-error-handler"),
				"response-validation",
			);
			assert.deepEqual(await response.json(), {
				code: "INVALID_RESPONSE",
				path: "/responses/invalid-declared",
			});
		});
	});
};
