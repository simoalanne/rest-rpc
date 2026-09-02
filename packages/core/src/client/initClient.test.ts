import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { route } from "../contract/routeFactory.ts";
import { initClient } from "./initClient.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type FetchCall = {
	url: string;
	init?: RequestInit;
};

const apiContract = {
	todos: {
		list: route
			.get("/todos")
			.query(
				z.object({
					search: z.string().optional(),
				}),
			)
			.response(200, z.array(z.object({ id: z.string() }))),
		publish: route
			.post("/todos/:id/publish")
			.params(z.object({ id: z.string() }))
			.response(200, z.object({ id: z.string() }))
			.response(202, z.object({ queued: z.literal(true) })),
	},
	socket: {
		join: route
			.ws("/rooms/:roomId")
			.params(z.object({ roomId: z.string() }))
			.clientMessage("message", z.object({ text: z.string() }))
			.serverMessage("message", z.object({ text: z.string() })),
	},
};

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

	it("returns the API tree directly", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.todos.list.fetch({ search: "milk" });

		assert.equal(calls[0]?.url, "https://api.test/todos?search=milk");
	});
});
