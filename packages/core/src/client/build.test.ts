import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClientTestContract } from "../../test/factories/client.ts";
import { initClient, mapApiClientContract } from "./index.ts";

describe("ApiClient route tree", () => {
	it("creates route helpers that match route capabilities", () => {
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
		});

		assert.deepEqual(Object.keys(client.todos.list), [
			"fetch",
			"fetchResponse",
		]);
		assert.deepEqual(Object.keys(client.todos.publish), ["fetchResponse"]);
		assert.deepEqual(Object.keys(client.socket.join), ["openConnection"]);
	});

	it("maps API client route leaves", () => {
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
		});

		const mapped = mapApiClientContract(client, (_route, path) =>
			path.join("."),
		);

		assert.equal(mapped.todos.list, "todos.list");
		assert.equal(mapped.socket.join, "socket.join");
	});
});
