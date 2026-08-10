import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createClientTestContract } from "../../test/factories/client.ts";
import { initClient } from "./index.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const ndjsonResponse = (chunks: string[]) => {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
				controller.close();
			},
		}),
		{ status: 200 },
	);
};

describe("ApiClient streams", () => {
	it("parses NDJSON stream chunks and final lines without newlines", async () => {
		globalThis.fetch = async () =>
			ndjsonResponse(['{"id":"one"}\n{"id"', ':"two"}\n', '{"id":"three"}']);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		const events = [];
		for await (const event of await client.events.stream.fetch()) {
			events.push(event);
		}

		assert.deepEqual(events, [{ id: "one" }, { id: "two" }, { id: "three" }]);
	});

	it("trusts streamed items by default", async () => {
		globalThis.fetch = async () => ndjsonResponse(['{"id":123}\n']);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		const events = await client.events.stream.fetch();
		const parsed = [];

		for await (const event of events) parsed.push(event);

		assert.deepEqual(parsed, [{ id: 123 }]);
	});

	it("validates streamed items when configured", async () => {
		globalThis.fetch = async () => ndjsonResponse(['{"id":123}\n']);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		const events = await client.events.stream.fetch();

		await assert.rejects(async () => {
			for await (const _event of events) {
				_event;
			}
		});
	});

	it("rejects declared stream responses without a body", async () => {
		globalThis.fetch = async () =>
			new Response(null, {
				status: 200,
			});
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await assert.rejects(
			() => client.events.stream.fetch(),
			/empty stream response/,
		);
	});
});
