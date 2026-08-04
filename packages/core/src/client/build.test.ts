import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClientTestContract } from "./factories.ts";
import { initClient, mapApiClientContract } from "./index.ts";

describe("ApiClient route tree", () => {
	it("creates route helpers that match route capabilities", () => {
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		assert.deepEqual(Object.keys(client.todos.list), [
			"fetch",
			"fetchResponse",
		]);
		assert.deepEqual(Object.keys(client.todos.publish), ["fetchResponse"]);
		assert.deepEqual(Object.keys(client.socket.join), [
			"connect",
			"tryConnect",
		]);
	});

	it("maps API client route leaves", () => {
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		const mapped = mapApiClientContract(client, (_route, path) =>
			path.join("."),
		);

		assert.equal(mapped.todos.list, "todos.list");
		assert.equal(mapped.socket.join, "socket.join");
	});
});
