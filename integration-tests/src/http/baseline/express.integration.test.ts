import assert from "node:assert/strict";
import { createServer } from "node:http";
import { it } from "node:test";
import { initClient } from "@rest-rpc/core";
import { registerRoutes } from "@rest-rpc/express";
import express from "express";
import { createExpressAdapter } from "../harness/express.ts";
import { listen } from "../harness/listen.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createExpressAdapter(createIntegrationImplementations()));

it("passes matched routes to Express route middleware", async () => {
	const seenRoutes: string[] = [];
	const server = await createExpressAdapter(
		createIntegrationImplementations(),
		{
			registerRoutesOptions: {
				middleware: [
					(_req, res, next, route) => {
						seenRoutes.push(`${route.method} ${route.path}`);
						res.setHeader("x-route-middleware", route.path);
						next();
					},
				],
			},
		},
	).start();

	try {
		const client = initClient(integrationContract, {
			baseUrl: server.origin,
		});
		const response = await client.items.get.fetchResponse({ id: "item-1" });

		assert.equal(response.headers.get("x-route-middleware"), "/items/:id");
		assert.deepEqual(seenRoutes, ["GET /items/:id"]);
	} finally {
		await server.close();
	}
});

it("supports Express router scoped middleware with a prefixed client baseUrl", async () => {
	const app = express();
	const api = express.Router();

	api.use(express.json());
	api.use((_req, res, next) => {
		res.setHeader("x-scoped-middleware", "express");
		next();
	});
	registerRoutes(api, createIntegrationImplementations());
	app.use("/api/v1", api);
	app.get("/outside", (_req, res) => {
		res.sendStatus(204);
	});

	const server = await listen(createServer(app));

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
		assert.equal(response.headers.get("x-scoped-middleware"), "express");

		const outsideResponse = await fetch(`${server.origin}/outside`);

		assert.equal(outsideResponse.status, 204);
		assert.equal(outsideResponse.headers.get("x-scoped-middleware"), null);
	} finally {
		await server.close();
	}
});
