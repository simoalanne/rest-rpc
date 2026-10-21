import {
	createBodyCodecRegistry,
	normalizeMediaType,
	type BodyCodec,
} from "@rest-rpc/core/codecs";
import { deserializeRequestBody as deserialize } from "./deserializeRequestBody.ts";

const deserializeRequestBody = (
	raw: Request,
	bodyCodecs: readonly BodyCodec[] = [],
) =>
	deserialize(
		raw,
		normalizeMediaType(raw.headers.get("content-type")),
		createBodyCodecRegistry(bodyCodecs),
	);

const request = (body: string, headers: Record<string, string> = {}) =>
	new Request("http://localhost/", {
		method: "POST",
		body,
		headers: { "content-type": "application/json", ...headers },
	});

describe("deserializeRequestBody", () => {
	it("returns a bad-request rejection for malformed JSON", async () => {
		const raw = request("{");
		expect((await deserializeRequestBody(raw)).rejection?.status).toBe(400);
	});

	it("passes the Fetch request to a custom codec before the defaults", async () => {
		const raw = new Request("http://localhost/", {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: '{"value":"decoded"}',
		});
		const result = await deserializeRequestBody(raw, [
			{
				mediaTypes: ["application/json"],
				deserialize: async (input) =>
					((await input.json()) as { value: string }).value,
			},
		]);
		expect(result.body).toBe("decoded");
	});

	it("leaves requests without a content type or body undecoded", async () => {
		const raw = new Request("http://localhost/");
		expect(await deserializeRequestBody(raw)).toEqual({
			body: undefined,
			rejection: undefined,
		});
	});
});
