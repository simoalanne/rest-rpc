import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { Writable } from "node:stream";
import { writeNodeResponse, writeStreamResponse } from "./response.ts";

describe("response", () => {
	it("writes custom serialized bytes and applies response header precedence", async () => {
		const response = new ServerResponse(new IncomingMessage(new Socket()));
		const end = vi.spyOn(response, "end").mockReturnValue(response);
		await writeNodeResponse(
			{
				kind: "response",
				status: 202,
				headers: {
					"x-source": "handler",
					"content-type": "application/custom",
				},
				body: { value: "data", contentType: "application/custom" },
			},
			response,
			[
				{
					match: (mediaType) => mediaType === "application/custom",
					serialize: () => ({
						body: Buffer.from("encoded"),
						contentType: null,
						headers: { "x-source": "codec" },
					}),
				},
			],
		);
		expect(response.statusCode).toBe(202);
		expect(response.getHeader("x-source")).toBe("handler");
		expect(response.hasHeader("content-type")).toBe(false);
		expect(end).toHaveBeenCalledWith(Buffer.from("encoded"));
	});

	it("ends bodyless responses without invoking a serializer", async () => {
		const response = new ServerResponse(new IncomingMessage(new Socket()));
		const end = vi.spyOn(response, "end").mockReturnValue(response);
		const serialize = vi.fn();
		await writeNodeResponse({ kind: "response", status: 204 }, response, [
			{ match: () => true, serialize },
		]);
		expect(end).toHaveBeenCalledWith();
		expect(serialize).not.toHaveBeenCalled();
	});

	it("writes stream frames in order", async () => {
		const chunks: string[] = [];
		const output = new Writable({
			write(chunk, _encoding, done) {
				chunks.push(chunk.toString());
				done();
			},
		});
		const response = Object.assign(output, {
			statusCode: 0,
			setHeader: vi.fn(),
		}) as unknown as ServerResponse;
		await writeStreamResponse(
			(async function* () {
				yield "first";
				yield "second";
			})(),
			response,
			200,
		);
		expect(chunks).toEqual(["first", "second"]);
		expect(response.setHeader).toHaveBeenCalledWith(
			"content-type",
			"text/event-stream",
		);
	});

	it("propagates stream source failures", async () => {
		const failure = new Error("source failed");
		const failingOutput = Object.assign(
			new Writable({
				write(_chunk, _encoding, done) {
					done();
				},
			}),
			{ setHeader: vi.fn() },
		) as unknown as ServerResponse;
		await expect(
			writeStreamResponse(
				(async function* () {
					yield "first";
					throw failure;
				})(),
				failingOutput,
				200,
			),
		).rejects.toBe(failure);
	});
});
