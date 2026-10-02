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
		expect(await deserializeRequestBody(raw, raw, [], 4)).toEqual({
			body: "é",
			rejection: undefined,
		});
	});

	it("rejects a streamed body exceeding the byte limit without content-length", async () => {
		const raw = request('"é"');
		expect(
			(await deserializeRequestBody(raw, raw, [], 3)).rejection?.status,
		).toBe(413);
	});

	it("rejects an oversized declared length before consuming the body", async () => {
		const raw = request("{}", { "content-length": "10" });
		expect(
			(await deserializeRequestBody(raw, raw, [], 9)).rejection?.status,
		).toBe(413);
		expect(raw.bodyUsed).toBe(false);
	});

	it("returns a bad-request rejection for malformed JSON", async () => {
		const raw = request("{");
		expect((await deserializeRequestBody(raw, raw)).rejection?.status).toBe(
			400,
		);
	});

	it("uses a custom decoder without constructing the lazy Fetch request", async () => {
		const nativeRequest = { value: "decoded" };
		const toFetchRequest = vi.fn();
		const result = await deserializeRequestBody(
			nativeRequest,
			{
				contentType: "application/json; charset=utf-8",
				toFetchRequest,
			},
			[
				{
					match: (mediaType) => mediaType === "application/json",
					deserialize: (input) => input.value,
				},
			],
		);
		expect(result.body).toBe("decoded");
		expect(toFetchRequest).not.toHaveBeenCalled();
	});

	it("leaves requests without a content type or body undecoded", async () => {
		const raw = new Request("http://localhost/");
		expect(await deserializeRequestBody(raw, raw)).toEqual({
			body: undefined,
			rejection: undefined,
		});
	});
});
