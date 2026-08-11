import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { streamsContract } from "./contract.ts";

type StreamsClient = ReturnType<typeof initClient<typeof streamsContract>>;

type StreamsSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

const collectAsyncIterable = async <T>(iterable: AsyncIterable<T>) => {
	const items: T[] = [];
	for await (const item of iterable) items.push(item);
	return items;
};

export const runStreamsSuite = (adapter: StreamsSuiteAdapter) => {
	describe(`${adapter.name} streams integration`, () => {
		let server: StartedServer;
		let client: StreamsClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(streamsContract, { origin: server.origin });
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

		it("surfaces invalid streamed chunks while continuing client iteration", async () => {
			const stream = await client.invalid.fetch();
			const iterator = stream[Symbol.asyncIterator]();

			assert.deepEqual(await iterator.next(), {
				done: false,
				value: { id: "event-1", index: 1 },
			});
			await assert.rejects(() => iterator.next());
		});
	});
};
