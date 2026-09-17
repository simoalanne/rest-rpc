import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../harness/listen.ts";

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

		before(async () => {
			server = await adapter.start();
		});

		after(async () => {
			await server.close();
		});

		it("preserves headers written by framework middleware", async () => {
			// This fixture deliberately overrides its declared JSON media type.
			// Inspect native delivery directly; the client now rejects that mismatch.
			const response = await fetch(
				`${server.origin}/response-lifecycle/json-content-type`,
			);

			assert.equal(response.status, 200);
			for (const [name, value] of Object.entries(expectedHeaders)) {
				assert.equal(response.headers.get(name), value);
			}
			assert.deepEqual(await response.json(), { ok: true });
		});
	});
};
