import { StreamableFile } from "@nestjs/common";
import { resolveBodyCodec } from "@rest-rpc/core/codecs";
import { Readable } from "node:stream";
import { nestBodyCodecs } from "./codecs.ts";

const serialize = async (value: unknown, contentType: string) =>
	resolveBodyCodec(contentType, nestBodyCodecs)!.serialize!(value, contentType);

const contents = async (file: StreamableFile) => {
	const chunks: Buffer[] = [];
	for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString();
};

describe("codecs", () => {
	it.each(["application/json", "application/problem+json"])(
		"leaves %s serialization to Nest",
		async (contentType) => {
			const value = { message: "hello" };
			expect((await serialize(value, contentType)).body).toBe(value);
		},
	);

	it.each([
		["text/plain", "hello", "hello"],
		[
			"application/x-www-form-urlencoded",
			new URLSearchParams({ name: "Ada Lovelace" }),
			"name=Ada+Lovelace",
		],
		["application/octet-stream", new Uint8Array([65, 66]), "AB"],
		["application/octet-stream", new Blob(["blob"]), "blob"],
		["application/octet-stream", Readable.from(["stream"]), "stream"],
	])(
		"wraps %s response values in StreamableFile",
		async (contentType, value, expected) => {
			const { body } = await serialize(value, contentType);
			expect(body).toBeInstanceOf(StreamableFile);
			const file = body as StreamableFile;
			expect(file.getHeaders().type).toBe(contentType);
			expect(await contents(file)).toBe(expected);
		},
	);

	it.each([
		["text/plain", 42, "Expected string body"],
		[
			"application/x-www-form-urlencoded",
			{ name: "Ada" },
			"Expected URLSearchParams body",
		],
		[
			"application/octet-stream",
			"bytes",
			"Expected Blob, Uint8Array, or Readable body",
		],
	])(
		"rejects values unsupported by the %s codec",
		async (contentType, value, message) => {
			await expect(serialize(value, contentType)).rejects.toThrow(message);
		},
	);
});
