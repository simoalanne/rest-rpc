import { frameSseStream, sse } from "./sse.ts";

describe("sse", () => {
	it("emits the supported JSON data and metadata frames", async () => {
		async function* values() {
			yield sse({ data: { count: 1 }, id: "one", event: "update", retry: 100 });
			yield { count: 2 };
		}
		const frames: string[] = [];
		for await (const frame of frameSseStream(values())) frames.push(frame);
		expect(frames).toEqual([
			'id: one\nevent: update\nretry: 100\ndata: {"count":1}\n\n',
			'data: {"count":2}\n\n',
		]);
	});

	it.each([undefined, 1n])(
		"rejects unframed stream data without a JSON representation (%s)",
		async (data) => {
			async function* values() {
				yield data;
			}
			await expect(
				frameSseStream(values())[Symbol.asyncIterator]().next(),
			).rejects.toThrow();
		},
	);
	it("frames raw data and branded event metadata without interpreting unbranded objects", async () => {
		async function* values() {
			yield { data: "ordinary object" };
			yield sse({ data: { count: 1 }, id: "", event: "update", retry: 0 });
		}
		const frames: string[] = [];
		for await (const frame of frameSseStream(values())) frames.push(frame);
		expect(frames).toEqual([
			'data: {"data":"ordinary object"}\n\n',
			'id: \nevent: update\nretry: 0\ndata: {"count":1}\n\n',
		]);
	});

	it.each(["\0", "\r", "\n"])("rejects an id containing %j", (id) => {
		expect(() => sse({ data: null, id })).toThrow(TypeError);
	});

	it.each(["\r", "\n"])("rejects an event name containing %j", (event) => {
		expect(() => sse({ data: null, event })).toThrow(TypeError);
	});

	it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid retry %s",
		(retry) => {
			expect(() => sse({ data: null, retry })).toThrow(TypeError);
		},
	);

	it("rejects data with no JSON representation or failed serialization", () => {
		expect(() => sse({ data: undefined })).toThrow(
			"SSE event data must have a JSON representation.",
		);
		expect(() => sse({ data: 1n })).toThrow(
			"SSE event data must be JSON serializable.",
		);
	});
});
