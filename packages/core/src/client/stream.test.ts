import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { HttpError, initClient } from "./index.ts";
import { parseSseStream } from "./stream.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const apiContract = {
	events: {
		stream: route
			.get("/events")
			.streamResponse(200, z.object({ id: z.string() })),
		procedure: route.streamOutput(z.object({ id: z.string() })),
		mixed: route
			.get("/events/mixed")
			.streamResponse(200, z.object({ id: z.string() }))
			.response(202, z.object({ queued: z.literal(true) })),
	},
};

const sseResponse = (chunks: Uint8Array[] | string[]) => {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(
						typeof chunk === "string" ? encoder.encode(chunk) : chunk,
					);
				}
				controller.close();
			},
		}),
		{ status: 200, headers: { "content-type": "text/event-stream" } },
	);
};

const collect = async (iterable: AsyncIterable<unknown>) => {
	const values = [];
	for await (const value of iterable) values.push(value);
	return values;
};

describe("ApiClient streams", () => {
	it("parses canonical SSE frames split across arbitrary chunks", async () => {
		globalThis.fetch = async () =>
			sseResponse([
				'id: event-1\nevent: updated\nretry: 2000\ndata: {"id"',
				':"one"}\n\ndata: {"id":"two"}\n\n',
			]);
		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		const response = await client.events.stream();
		assert.equal(response.status, 200);
		assert.deepEqual(await collect(response.body), [
			{
				data: { id: "one" },
				id: "event-1",
				event: "updated",
				retry: 2000,
			},
			{ data: { id: "two" } },
		]);
	});

	it("returns procedure streams as event envelopes", async () => {
		globalThis.fetch = async () => sseResponse(['data: {"id":"one"}\n\n']);
		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		assert.deepEqual(await collect(await client.events.procedure()), [
			{ data: { id: "one" } },
		]);
	});

	it("preserves UTF-8 characters at every network split point", async () => {
		const bytes = new TextEncoder().encode('data: {"id":"café ☕"}\n\n');
		for (let split = 1; split < bytes.length; split += 1) {
			const response = sseResponse([bytes.slice(0, split), bytes.slice(split)]);
			assert.deepEqual(
				await collect(
					parseSseStream(
						type<{ id: string }>(),
						response.body as ReadableStream<Uint8Array<ArrayBuffer>>,
						false,
					),
				),
				[{ data: { id: "café ☕" } }],
			);
		}
	});

	it("validates event data when configured", async () => {
		globalThis.fetch = async () => sseResponse(['data: {"id":123}\n\n']);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		const response = await client.events.stream();
		await assert.rejects(
			() => collect(response.body),
			(error) => {
				assert.ok(error instanceof HttpError);
				assert.equal(error.status, 200);
				assert.deepEqual(error.body, { id: 123 });
				return true;
			},
		);
	});

	it("requires an SSE content type and body", async () => {
		const client = initClient(apiContract, { baseUrl: "https://api.test" });
		globalThis.fetch = async () =>
			new Response("", { headers: { "content-type": "application/x-ndjson" } });
		await assert.rejects(
			() => client.events.stream(),
			/unsupported stream content-type/,
		);

		globalThis.fetch = async () =>
			new Response(null, { headers: { "content-type": "text/event-stream" } });
		await assert.rejects(() => client.events.stream(), /no stream body/);
	});

	it("keeps ordinary statuses on their declared non-stream path", async () => {
		globalThis.fetch = async () =>
			Response.json({ queued: true }, { status: 202 });
		const client = initClient(apiContract, { baseUrl: "https://api.test" });
		const response = await client.events.mixed();
		assert.deepEqual(response, {
			status: 202,
			headers: response.headers,
			responseHeaders: undefined,
			body: { queued: true },
		});
	});

	it("ignores unrecognized lines", async () => {
		const response = sseResponse(["future: value\ndata: null\n\n"]);
		assert.deepEqual(
			await collect(
				parseSseStream(
					type<null>(),
					response.body as ReadableStream<Uint8Array<ArrayBuffer>>,
					false,
				),
			),
			[{ data: null }],
		);
	});

	it("rejects malformed JSON, missing data, and incomplete frames", async () => {
		for (const frame of ["data: invalid\n\n", "id: event-1\n\n", "data: 1"]) {
			const response = sseResponse([frame]);
			await assert.rejects(() =>
				collect(
					parseSseStream(
						undefined,
						response.body as ReadableStream<Uint8Array<ArrayBuffer>>,
						false,
					),
				),
			);
		}
	});

	it("releases and cancels the stream reader on failure or early return", async () => {
		const invalidBody = sseResponse(["data: invalid\n\n"])
			.body as ReadableStream<Uint8Array<ArrayBuffer>>;
		await assert.rejects(() =>
			collect(parseSseStream(undefined, invalidBody, false)),
		);
		assert.equal(invalidBody.locked, false);

		let cancelled = false;
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
			start(controller) {
				controller.enqueue(encoder.encode("data: 1\n\ndata: 2\n\n"));
			},
			cancel() {
				cancelled = true;
			},
		});
		for await (const event of parseSseStream(undefined, body, false)) {
			assert.deepEqual(event, { data: 1 });
			break;
		}
		assert.equal(cancelled, true);
		assert.equal(body.locked, false);
	});
});
