import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { router } from "../contract/contract.ts";
import { initClient } from "./initClient.ts";
import { mapApiClientContract } from "./routes.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type FetchCall = {
	url: string;
	init?: RequestInit;
};

const apiContract = router({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			query: z.object({
				search: z.string().optional(),
			}),
			responses: {
				200: z.array(z.object({ id: z.string() })),
			},
		},
		publish: {
			method: "POST",
			path: "/todos/:id/publish",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: z.object({ id: z.string() }),
				202: z.object({ queued: z.literal(true) }),
			},
		},
	},
	socket: {
		join: {
			method: "GET",
			path: "/rooms/:roomId",
			pathParams: z.object({ roomId: z.string() }),
			mode: "webSocket",
			messages: {
				client: z.object({ text: z.string() }),
				server: z.object({ text: z.string() }),
			},
		},
	},
});

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

const captureFetch = (response: Response) => {
	const calls: FetchCall[] = [];

	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return response;
	};

	return calls;
};

describe("initClient", () => {
	it("creates route helpers that match route capabilities", () => {
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		assert.deepEqual(Object.keys(client.todos.list), [
			"fetch",
			"fetchResponse",
		]);
		assert.deepEqual(Object.keys(client.todos.publish), ["fetchResponse"]);
		assert.deepEqual(Object.keys(client.socket.join), ["openConnection"]);
	});

	it("maps API client route leaves", () => {
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		const mapped = mapApiClientContract(client, (_route, path) =>
			path.join("."),
		);

		assert.equal(mapped.todos.list, "todos.list");
		assert.equal(mapped.socket.join, "socket.join");
	});

	it("returns the API tree directly", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.todos.list.fetch({ search: "milk" });

		assert.equal(calls[0]?.url, "https://api.test/todos?search=milk");
	});
});
