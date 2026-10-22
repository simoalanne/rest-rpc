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
			{ data: { count: 2 } },
		]);
	});
	it("rejects frames that cannot be decoded as unknown errors", async () => {
		for (const [frames, cause] of [
			["data: {\n\n", expect.any(SyntaxError)],
			["id: one\n\n", new Error("SSE frame has no data field.")],
			["data: 1\n", new Error("Incomplete SSE frame.")],
		] as const) {
			await expect(
				collect(parseSseStream(undefined, stream(frames), false)),
			).rejects.toMatchObject({ code: "UNKNOWN_ERROR", status: 201, cause });
		}
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

	it("rejects schema failures as unknown errors with the event data unless validation is disabled", async () => {
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
			code: "UNKNOWN_ERROR",
			status: 201,
			data: 1,
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
			{ data: 3 },
		]);
	});
});
