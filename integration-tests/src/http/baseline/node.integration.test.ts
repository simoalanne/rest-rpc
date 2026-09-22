import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../harness/listen.ts";
import { createNodeAdapter } from "../harness/node.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createNodeAdapter(createIntegrationImplementations()));

describe("node route matching integration", () => {
	let server: StartedServer;

	before(async () => {
		server = await createNodeAdapter(
			createIntegrationImplementations(),
		).start();
	});

	after(async () => {
		await server.close();
	});

	it("returns an empty 404 response for unknown paths", async () => {
		const response = await fetch(`${server.origin}/unknown`);

		assert.equal(response.status, 404);
		assert.equal(await response.text(), "");
	});

	it("uses the adapter fallback for unregistered methods on matched paths", async () => {
		const response = await fetch(`${server.origin}/health`, {
			method: "POST",
		});

		assert.equal(response.status, 404);
		assert.equal(await response.text(), "");
	});

	it("supports matching routes under a path prefix", async () => {
		const prefixedServer = await createNodeAdapter(
			createIntegrationImplementations(),
			{ createHandlerOptions: { prefix: "/api/v1" } },
		).start();

		try {
			assert.equal(
				(await fetch(`${prefixedServer.origin}/api/v1/health`)).status,
				204,
			);
			assert.equal(
				(await fetch(`${prefixedServer.origin}/health`)).status,
				404,
			);
		} finally {
			await prefixedServer.close();
		}
	});
});
