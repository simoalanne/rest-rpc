import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../harness/listen.ts";
import { createWebAdapter } from "../harness/web.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createWebAdapter(createIntegrationImplementations()));

describe("web route matching integration", () => {
	let server: StartedServer;

	before(async () => {
		server = await createWebAdapter(createIntegrationImplementations()).start();
	});

	after(async () => {
		await server.close();
	});

	it("returns an empty 404 response for unknown paths", async () => {
		const response = await fetch(`${server.origin}/unknown`);

		assert.equal(response.status, 404);
		assert.equal(await response.text(), "");
	});

	it("returns an empty 404 response for unregistered methods", async () => {
		const response = await fetch(`${server.origin}/health`, {
			method: "POST",
		});

		assert.equal(response.status, 404);
		assert.equal(await response.text(), "");
	});
});
