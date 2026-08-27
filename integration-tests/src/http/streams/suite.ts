import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { streamsContract } from "./contract.ts";
import type { StreamCancellationProbe } from "./handlers.ts";

type StreamsClient = ReturnType<typeof initClient<typeof streamsContract>>;

type StreamsSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
	cancellationProbe?: StreamCancellationProbe;
};

const collectAsyncIterable = async <T>(iterable: AsyncIterable<T>) => {
	const items: T[] = [];
	for await (const item of iterable) items.push(item);
	return items;
};

const assertFetchOrFirstIterationRejects = async <T>(
	fetchStream: () => Promise<AsyncIterable<T>>,
) => {
	let stream: AsyncIterable<T>;
	try {
		stream = await fetchStream();
	} catch (error) {
		assert.ok(error);
		return;
	}

	const iterator = stream[Symbol.asyncIterator]();
	await assert.rejects(() => iterator.next());
};

export const runStreamsSuite = (adapter: StreamsSuiteAdapter) => {
	describe(`${adapter.name} streams integration`, () => {
		let server: StartedServer;
		let client: StreamsClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(streamsContract, { baseUrl: server.origin });
		});

		after(async () => {
			await server.close();
		});

		it("receives empty NDJSON streams as empty async iterables", async () => {
			const stream = await client.empty.fetch();

			assert.deepEqual(await collectAsyncIterable(stream), []);
		});

		it("frames NDJSON chunks exactly once on the wire", async () => {
			const response = await fetch(`${server.origin}/streams/ndjson-framing`);

			assert.equal(response.status, 200);
			assert.match(
				response.headers.get("content-type") ?? "",
				/^application\/x-ndjson/,
			);
			assert.equal(
				await response.text(),
				'{"id":"event-1","index":1}\n{"id":"event-2","index":2}\n',
			);
		});

		it("frames SSE chunks and passes Last-Event-ID to handlers", async () => {
			const response = await fetch(`${server.origin}/streams/sse`, {
				headers: {
					"Last-Event-ID": "event-1",
				},
			});

			assert.equal(response.status, 200);
			assert.match(
				response.headers.get("content-type") ?? "",
				/^text\/event-stream/,
			);
			assert.equal(
				await response.text(),
				'id: event-2\nretry: 1000\ndata: {"id":"event-2","index":2,"resumedFrom":"event-1"}\n\n',
			);
		});

		it("propagates client NDJSON iterator cancellation to server stream producers", async () => {
			if (!adapter.cancellationProbe) {
				throw new Error("Streams suite adapter is missing cancellation probe");
			}

			adapter.cancellationProbe.reset();
			const stream = await client.cancellable.fetch();

			for await (const event of stream) {
				assert.deepEqual(event, { id: "event-1", index: 1 });
				break;
			}

			await adapter.cancellationProbe.waitForSignalAborted();
			await adapter.cancellationProbe.waitForFinalized();
		});

		it("does not JSON-frame raw custom streams", async () => {
			const response = await client.rawText.fetchResponse();

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^text\/plain/,
			);
			assert.equal(await response.body.text(), '{"not":"ndjson"}\nplain tail');
		});

		it("streams raw binary custom chunks without text encoding", async () => {
			const response = await client.rawBytes.fetchResponse();

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^application\/octet-stream/,
			);
			assert.deepEqual(
				Array.from(new Uint8Array(await response.body.arrayBuffer())),
				[0, 1, 127, 128, 255],
			);
		});

		it("surfaces invalid streamed chunks while continuing client iteration", async () => {
			const stream = await client.invalid.fetch();
			const iterator = stream[Symbol.asyncIterator]();

			assert.deepEqual(await iterator.next(), {
				done: false,
				value: { id: "event-1", index: 1 },
			});

			await assert.rejects(() => iterator.next());
		});

		it("surfaces stream failures before the first chunk", async () => {
			await assertFetchOrFirstIterationRejects(() =>
				client.throwsBeforeFirstChunk.fetch(),
			);
		});

		it("surfaces stream failures after delivered chunks", async () => {
			const stream = await client.throwsAfterChunks.fetch();
			const iterator = stream[Symbol.asyncIterator]();

			assert.deepEqual(await iterator.next(), {
				done: false,
				value: { id: "event-1", index: 1 },
			});
			assert.deepEqual(await iterator.next(), {
				done: false,
				value: { id: "event-2", index: 2 },
			});

			await assert.rejects(() => iterator.next());
		});
	});
};
