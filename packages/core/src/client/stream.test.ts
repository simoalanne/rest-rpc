import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createClientTestContract } from "../../test/factories/client.ts";
import { type } from "../standard-schema/type.ts";
import { initClient } from "./index.ts";
import { parseNdjsonStream } from "./stream.ts";

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

	it("skips blank NDJSON lines", async () => {
		const events = [];

		for await (const event of parseNdjsonStream(
			type<{ id: string }>(),
			ndjsonResponse(["\n", '{"id":"one"}\n\n'])
				.body as ReadableStream<Uint8Array>,
			false,
		)) {
			events.push(event);
		}

		assert.deepEqual(events, [{ id: "one" }]);
	});

	it("releases the stream reader when parsing fails", async () => {
		const body = ndjsonResponse(["not json\n"])
			.body as ReadableStream<Uint8Array>;
		const events = parseNdjsonStream(type<{ id: string }>(), body, false);

		await assert.rejects(async () => {
			for await (const _event of events) {
				_event;
			}
		});

		assert.equal(body.locked, false);
	});

	it("cancels the underlying stream when iteration ends early", async () => {
		let cancelled = false;
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('{"id":"one"}\n'));
				controller.enqueue(encoder.encode('{"id":"two"}\n'));
			},
			cancel() {
				cancelled = true;
			},
		});

		for await (const event of parseNdjsonStream(
			type<{ id: string }>(),
			body,
			false,
		)) {
			assert.deepEqual(event, { id: "one" });
			break;
		}

		assert.equal(cancelled, true);
		assert.equal(body.locked, false);
	});
});
