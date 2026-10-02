import { normalizeImplicitResponse } from "./implicitResponse.ts";
import { sse } from "./sse.ts";

describe("normalizeImplicitResponse", () => {
	it.each([
		null,
		undefined,
		"hello",
		42,
		{ data: "ordinary" },
		{ contentType: 1, data: "ordinary" },
	])("uses JSON for ordinary output %j", (value) => {
		expect(normalizeImplicitResponse(value)).toEqual({
			kind: "response",
			status: 200,
			body: { value, contentType: "application/json" },
		});
	});

	it("recognizes custom output structurally and gives status envelopes precedence", () => {
		expect(
			normalizeImplicitResponse({ contentType: "text/plain", data: "hello" }),
		).toMatchObject({ body: { value: "hello", contentType: "text/plain" } });
		expect(
			normalizeImplicitResponse({
				status: 204,
				contentType: "text/plain",
				data: "ignored",
			}),
		).toEqual({ kind: "response", status: 204, headers: undefined });
	});

	it("distinguishes an absent body from an explicitly undefined body", () => {
		expect(normalizeImplicitResponse({ status: 204 })).not.toHaveProperty(
			"body",
		);
		expect(
			normalizeImplicitResponse({ status: 200, body: undefined }),
		).toHaveProperty("body", {
			value: undefined,
			contentType: "application/json",
		});
	});

	it.each([100, 200, 599])(
		"accepts integer HTTP status %s and preserves headers",
		(status) => {
			expect(
				normalizeImplicitResponse({
					status,
					body: "hello",
					contentType: "text/plain",
					responseHeaders: { count: 2 },
				}),
			).toEqual({
				kind: "response",
				status,
				headers: { count: 2 },
				body: { value: "hello", contentType: "text/plain" },
			});
		},
	);

	it.each([99, 600, 200.5, NaN, Infinity, "200", undefined])(
		"rejects invalid inferred status %s",
		(status) => {
			expect(() => normalizeImplicitResponse({ status })).toThrow(
				"Invalid inferred HTTP response status",
			);
		},
	);

	it.each(["plain", "envelope"])(
		"frames %s async iterables as SSE",
		async (mode) => {
			async function* values() {
				yield sse({ data: 1, id: "one" });
			}
			const output = values();
			const result = normalizeImplicitResponse(
				mode === "plain"
					? output
					: {
							status: 201,
							body: output,
							contentType: "text/plain",
							responseHeaders: { count: 1 },
						},
			);
			expect(result.kind).toBe("stream");
			expect(result.status).toBe(mode === "plain" ? 200 : 201);
			if (result.kind !== "stream") throw new Error("Expected stream");
			const frames = [];
			for await (const frame of result.body) frames.push(frame);
			expect(frames).toEqual(["id: one\ndata: 1\n\n"]);
		},
	);

	it("does not classify non-callable asyncIterator properties as streams", () => {
		const value = { [Symbol.asyncIterator]: true };
		expect(normalizeImplicitResponse(value)).toMatchObject({
			kind: "response",
			body: { value },
		});
	});
});
