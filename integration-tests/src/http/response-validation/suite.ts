import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../harness/listen.ts";

type ResponseValidationSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

export const runResponseValidationSuite = (
	adapter: ResponseValidationSuiteAdapter,
) => {
	describe(`${adapter.name} response validation integration`, () => {
		let server: StartedServer;

		before(async () => {
			server = await adapter.start();
		});

		after(async () => {
			await server.close();
		});

		it("routes declared response validation failures through custom error handling", async () => {
			const response = await fetch(
				`${server.origin}/response-validation/invalid-declared`,
			);

			assert.equal(response.status, 500);
			assert.equal(
				response.headers.get("x-error-handler"),
				"response-validation",
			);
			assert.deepEqual(await response.json(), {
				code: "INVALID_RESPONSE",
				path: "/response-validation/invalid-declared",
			});
		});
	});
};
