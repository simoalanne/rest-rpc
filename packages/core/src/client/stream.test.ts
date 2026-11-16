import { type } from "../standard-schema/type.ts";
import { parseSseStream } from "./stream.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";

const stream = (...chunks: string[]) =>
	new Response(
		new ReadableStream<Uint8Array<ArrayBuffer>>({
			start(controller) {
				for (const chunk of chunks)
					controller.enqueue(new TextEncoder().encode(chunk));
				controller.close();
			},
		}),
		{ status: 201 },
	) as Response & { body: ReadableStream<Uint8Array<ArrayBuffer>> };
const collect = async (events: AsyncIterable<unknown>) => {
	const result = [];
	for await (const event of events) result.push(event);
	return result;
};

describe("stream", () => {
	it("parses the supported JSON data and metadata frames", async () => {
		const events = parseSseStream(
			undefined,
			stream(
				'id: one\nevent: update\nretry: 100\ndata: {"count":1}\n\n',
				'data: {"count":2}\n\n',
			),
			false,
		);
		expect(await collect(events)).toEqual([
			{ data: { count: 1 }, id: "one", event: "update", retry: 100 },
			{ data: { count: 2 }, id: "one" },
		]);
	});
	it("splits lines on LF, CRLF and CR, also across chunks", async () => {
		const events = parseSseStream(
			undefined,
			stream("data: 1\r\n\r\n", "data: 2\r", "\n\r\n", "data: 3\r\r"),
			false,
		);
		expect(await collect(events)).toEqual([
			{ data: 1 },
			{ data: 2 },
			{ data: 3 },
		]);
	});

	it("reads fields as the SSE spec defines them", async () => {
		const events = parseSseStream(
			undefined,
			stream(
				// optional space, joined data lines, and an id that persists
				'id: one\ndata:{"a":\ndata: 1}\n\n',
				"data: 2\n\n",
				// a field without a colon has an empty value
				"data\n\n",
				// ids containing NUL and retry values that aren't digits are ignored
				"id: t\0wo\nretry: soon\ndata: 3\n\n",
			),
			false,
		);
		expect(await collect(events)).toEqual([
			{ id: "one", data: { a: 1 } },
			{ id: "one", data: 2 },
			{ id: "one", data: "" },
			{ id: "one", data: 3 },
		]);
	});

	it("rejects data that cannot be decoded as errors", async () => {
		await expect(
			collect(parseSseStream(undefined, stream("data: {\n\n"), false)),
		).rejects.toMatchObject({ cause: expect.any(SyntaxError) });
	});

	it("skips frames without data, such as keepalive comments", async () => {
		const events = parseSseStream(
			undefined,
			stream(": keepalive\n\n", "data: 1\n\n"),
			false,
		);
		expect(await collect(events)).toEqual([{ data: 1 }]);
	});

	it("keeps failures of reading the stream as transport errors", async () => {
		const failure = new TypeError("terminated");
		const response = new Response(
			new ReadableStream({ start: (controller) => controller.error(failure) }),
		) as Response & { body: ReadableStream<Uint8Array<ArrayBuffer>> };
		await expect(
			collect(parseSseStream(undefined, response, false)),
		).rejects.toBe(failure);
	});

	it("rejects schema failures as errors with the issues unless validation is disabled", async () => {
		const schema: StandardSchemaV1 = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ issues: [{ message: "invalid chunk" }] }),
			},
		};
		await expect(
			collect(parseSseStream(schema, stream("data: 1\n\n"), true)),
		).rejects.toMatchObject({
			cause: [{ message: "invalid chunk" }],
		});
		expect(
			await collect(parseSseStream(schema, stream("data: 1\n\n"), false)),
		).toEqual([{ data: 1 }]);
	});
	it("buffers split frames, parses event metadata and maps validated data", async () => {
		const events = parseSseStream(
			type((value: number) => value + 1),
			stream(
				"id: one\nevent: update\nretry: 100\ndata: ",
				"1\n",
				"\ndata: 2\n\n",
			),
			true,
		);
		expect(await collect(events)).toEqual([
			{ id: "one", event: "update", retry: 100, data: 2 },
			{ id: "one", data: 3 },
		]);
	});
});
