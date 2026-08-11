import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../http/harness/listen.ts";
import { startNextFixture } from "./nextServer.ts";
import { createNextUpstreamServer } from "./upstreamServer.ts";

describe("next app router integration", () => {
	let nextServer: StartedServer;
	let upstreamServer: StartedServer;
	let upstream: ReturnType<typeof createNextUpstreamServer>;

	before(async () => {
		upstream = createNextUpstreamServer();
		upstreamServer = await upstream.start();
		nextServer = await startNextFixture({
			REST_RPC_NEXT_UPSTREAM_ORIGIN: upstreamServer.origin,
		});
	});

	after(async () => {
		await nextServer?.close();
		await upstreamServer?.close();
	});

	it("registers catch-all router handlers in a real app router route", async () => {
		const response = await fetch(`${nextServer.origin}/api/items/catch-all`, {
			headers: {
				"x-next-fixture-title": "Catch-all item",
			},
		});

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			id: "catch-all",
			title: "Catch-all item",
		});
	});

	it("registers targeted single route handlers in a real app router route", async () => {
		const response = await fetch(
			`${nextServer.origin}/api/targeted/items/single`,
			{
				headers: {
					"x-next-fixture-title": "Single route item",
				},
			},
		);

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			id: "single",
			title: "Single route item",
		});
	});

	it("returns 404 for unknown catch-all router paths", async () => {
		const response = await fetch(`${nextServer.origin}/api/unknown`);

		assert.equal(response.status, 404);
		assert.equal(await response.text(), "");
	});

	it("returns 405 for methods not declared by catch-all contract routes", async () => {
		const response = await fetch(`${nextServer.origin}/api/items/catch-all`, {
			method: "DELETE",
		});

		assert.equal(response.status, 405);
	});

	it("uses Next method handling for methods not exported by targeted routes", async () => {
		const response = await fetch(
			`${nextServer.origin}/api/targeted/items/single`,
			{
				method: "POST",
			},
		);

		assert.equal(response.status, 405);
	});

	it("runs request validation in real app router routes", async () => {
		const response = await fetch(`${nextServer.origin}/api/items`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ title: 123 }),
		});

		assert.equal(response.status, 400);
	});

	it("caches server fetch client GET requests with automatic tags", async () => {
		const first = await fetch(`${nextServer.origin}/api/cache-probe/cache-key`);
		const second = await fetch(
			`${nextServer.origin}/api/cache-probe/cache-key`,
		);

		assert.equal(first.status, 200);
		assert.equal(second.status, 200);
		assert.deepEqual(await first.json(), { id: "cache-key", count: 1 });
		assert.deepEqual(await second.json(), { id: "cache-key", count: 1 });
		assert.equal(upstream.counters.get("cache-key"), 1);
	});

	it("keeps cached server fetch entries isolated by request URL", async () => {
		const firstA = await fetch(`${nextServer.origin}/api/cache-probe/a`);
		const firstB = await fetch(`${nextServer.origin}/api/cache-probe/b`);
		const secondA = await fetch(`${nextServer.origin}/api/cache-probe/a`);

		assert.equal(firstA.status, 200);
		assert.equal(firstB.status, 200);
		assert.equal(secondA.status, 200);
		assert.deepEqual(await firstA.json(), { id: "a", count: 1 });
		assert.deepEqual(await firstB.json(), { id: "b", count: 1 });
		assert.deepEqual(await secondA.json(), { id: "a", count: 1 });
		assert.equal(upstream.counters.get("a"), 1);
		assert.equal(upstream.counters.get("b"), 1);
	});
});
