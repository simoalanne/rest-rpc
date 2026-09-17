import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../harness/listen.ts";

type RequestCodecErrorsAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

export const runRequestCodecErrorsSuite = (
	adapter: RequestCodecErrorsAdapter,
) => {
	describe(`${adapter.name} request media type rejection`, () => {
		let server: StartedServer;
		before(async () => {
			server = await adapter.start();
		});
		after(async () => {
			await server.close();
		});

		for (const [path, method, contentType] of [
			["json", "POST", "text/plain"],
			["text", "POST", "application/xml"],
			["text", "POST", "application/octet-stream"],
			["binary", "POST", "text/plain"],
			["no-body", "DELETE", "application/json"],
		] as const) {
			it(`rejects ${contentType} for ${path}`, async () => {
				const response = await fetch(
					`${server.origin}/request-codec-errors/${path}`,
					{
						method,
						headers: { "content-type": contentType },
						body: "{}",
					},
				);
				assert.equal(response.status, 415);
				assert.deepEqual(await response.json(), {
					message: "Unsupported request body content type.",
				});
			});
		}
	});
};
