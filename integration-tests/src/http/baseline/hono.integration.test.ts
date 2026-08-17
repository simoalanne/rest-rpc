import assert from "node:assert/strict";
import type { Server } from "node:http";
import { it } from "node:test";
import { createAdaptorServer } from "@hono/node-server";
import { initClient } from "@rest-rpc/core";
import { registerRoutes } from "@rest-rpc/hono";
import { Hono } from "hono";
import { createHonoAdapter } from "../harness/hono.ts";
import { listen } from "../harness/listen.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createHonoAdapter(createIntegrationImplementations()));

it("supports Hono sub-app scoped middleware with a prefixed client baseUrl", async () => {
	const app = new Hono();
	const api = new Hono();

	api.use("*", async (c, next) => {
		await next();
		c.header("x-scoped-middleware", "hono");
	});
	registerRoutes(api, createIntegrationImplementations());
	app.route("/api/v1", api);
	app.get("/outside", (c) => c.body(null, 204));

	const server = await listen(
		createAdaptorServer({
			fetch: app.fetch,
		}) as Server,
	);

	try {
		const client = initClient(integrationContract, {
			baseUrl: `${server.origin}/api/v1`,
		});

		assert.equal(await client.health.fetch(), undefined);
		const response = await client.items.list.fetchResponse({
			search: "scoped",
		});

		assert.deepEqual(response.body, [
			{ id: "item-1", title: "scoped" },
			{ id: "item-2", title: "Second item" },
		]);
		assert.equal(response.headers.get("x-scoped-middleware"), "hono");

		const outsideResponse = await fetch(`${server.origin}/outside`);

		assert.equal(outsideResponse.status, 204);
		assert.equal(outsideResponse.headers.get("x-scoped-middleware"), null);
	} finally {
		await server.close();
	}
});
