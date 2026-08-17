import assert from "node:assert/strict";
import { it } from "node:test";
import { initClient } from "@rest-rpc/core";
import { registerRoutes } from "@rest-rpc/fastify";
import Fastify from "fastify";
import { createFastifyAdapter } from "../harness/fastify.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createFastifyAdapter(createIntegrationImplementations()));

it("supports Fastify scoped registration with a prefixed client baseUrl", async () => {
	const app = Fastify();

	await app.register(
		async (scopedApp) => {
			registerRoutes(scopedApp, createIntegrationImplementations());
		},
		{ prefix: "/api/v1" },
	);

	const origin = await app.listen({ host: "127.0.0.1", port: 0 });

	try {
		const client = initClient(integrationContract, {
			baseUrl: `${origin}/api/v1`,
		});

		assert.equal(await client.health.fetch(), undefined);
		assert.deepEqual(await client.items.list.fetch({ search: "scoped" }), [
			{ id: "item-1", title: "scoped" },
			{ id: "item-2", title: "Second item" },
		]);
	} finally {
		await app.close();
	}
});
