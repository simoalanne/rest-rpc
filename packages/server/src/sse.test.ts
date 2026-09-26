import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frameSseStream, isSseServerEvent, sse } from "./sse.ts";

const collect = async (values: AsyncIterable<string>) => {
	const result = [];
	for await (const value of values) result.push(value);
	return result;
};

describe("SSE framing", () => {
	it("frames plain data and branded metadata in canonical order", async () => {
		async function* events() {
			yield { message: "plain" };
			yield sse({
				data: { message: "updated" },
				id: "event-42",
				event: "updated",
				retry: 2000,
			});
		}

		assert.deepEqual(await collect(frameSseStream(events())), [
			'data: {"message":"plain"}\n\n',
			'id: event-42\nevent: updated\nretry: 2000\ndata: {"message":"updated"}\n\n',
		]);
	});

	it("brands explicit events and rejects values that could corrupt framing", () => {
		const event = sse({ data: null, id: "event-1" });
		assert.equal(isSseServerEvent(event), true);
		assert.deepEqual(Object.keys(event), ["data", "id"]);

		for (const value of ["nul\0", "cr\r", "lf\n"]) {
			assert.throws(() => sse({ data: null, id: value }), /SSE event id/);
		}
		for (const value of ["cr\r", "lf\n"]) {
			assert.throws(() => sse({ data: null, event: value }), /SSE event name/);
		}
		for (const retry of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => sse({ data: null, retry }), /SSE retry/);
		}
		assert.throws(() => sse({ data: undefined }), /JSON representation/);
		assert.throws(() => sse({ data: 1n }), /JSON serializable/);
	});
});
