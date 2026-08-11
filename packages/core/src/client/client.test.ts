import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	captureFetch,
	createClientTestContract,
	jsonResponse,
} from "../../test/factories/client.ts";
import { ApiClient, initClient } from "./client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("ApiClient", () => {
	it("exposes the built API tree from the class instance", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = new ApiClient(createClientTestContract(), {
			origin: "https://api.test",
		});

		await client.api.todos.list.fetch({ search: "milk" });

		assert.equal(calls[0]?.url, "https://api.test/todos?search=milk");
	});

	it("initClient returns the class API tree directly", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test/",
		});

		await client.todos.list.fetch({ search: "milk" });

		assert.equal(calls[0]?.url, "https://api.test/todos?search=milk");
	});

	it("rejects origin values with paths, search, hashes, or relative URLs", () => {
		for (const origin of [
			"https://api.test/api",
			"https://api.test?version=1",
			"https://api.test#api",
			"/api",
		]) {
			assert.throws(
				() =>
					initClient(createClientTestContract(), {
						origin,
					}),
				/origin must be an absolute URL origin without a path, search, or hash/,
			);
		}
	});
});
