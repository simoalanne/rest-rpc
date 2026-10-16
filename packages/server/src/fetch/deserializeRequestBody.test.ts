import { deserializeRequestBody } from "./deserializeRequestBody.ts";

const request = (body: string, headers: Record<string, string> = {}) =>
	new Request("http://localhost/", {
		method: "POST",
		body,
		headers: { "content-type": "application/json", ...headers },
	});

describe("deserializeRequestBody", () => {
	it("parses a body exactly at the byte limit", async () => {
		const raw = request('"é"');
		expect(await deserializeRequestBody(raw, [], 4)).toEqual({
			body: "é",
			rejection: undefined,
		});
	});

	it("rejects a streamed body exceeding the byte limit without content-length", async () => {
		const raw = request('"é"');
		expect((await deserializeRequestBody(raw, [], 3)).rejection?.status).toBe(
			413,
		);
	});

	it("rejects an oversized declared length before consuming the body", async () => {
		const raw = request("{}", { "content-length": "10" });
		expect((await deserializeRequestBody(raw, [], 9)).rejection?.status).toBe(
			413,
		);
		expect(raw.bodyUsed).toBe(false);
	});

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
		const toFetchRequest = vi.fn(() => raw);
		const result = await deserializeRequestBody(
			{ contentType: "application/json; charset=utf-8", toFetchRequest },
			[
				{
					match: (mediaType) => mediaType === "application/json",
					deserialize: async (input) =>
						((await input.json()) as { value: string }).value,
				},
			],
		);
		expect(result.body).toBe("decoded");
		expect(toFetchRequest).toHaveBeenCalledOnce();
	});

	it("applies the body limit to custom codecs", async () => {
		const raw = new Request("http://localhost/", {
			method: "POST",
			headers: { "content-type": "text/csv" },
			body: "a,b,c,d",
		});
		const result = await deserializeRequestBody(
			raw,
			[
				{
					match: (mediaType) => mediaType === "text/csv",
					deserialize: (input) => input.text(),
				},
			],
			3,
		);
		expect(result.rejection?.status).toBe(413);
	});

	it("leaves requests without a content type or body undecoded", async () => {
		const raw = new Request("http://localhost/");
		expect(await deserializeRequestBody(raw)).toEqual({
			body: undefined,
			rejection: undefined,
		});
	});
});
