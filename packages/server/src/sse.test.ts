import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import {
	formatSseEvent,
	sseEventMarker,
	sseEvent,
	validateSseEvents,
} from "./sse.ts";

describe("sseEvent", () => {
	it("marks events created by the helper", () => {
		const event = sseEvent({ id: "event-1" }, { id: "1", retry: 1_000 });
		assert.deepEqual(event.data, { id: "event-1" });
		assert.equal(event.id, "1");
		assert.equal(event.retry, 1_000);
	});
});

describe("formatSseEvent", () => {
	it("rejects undefined event data", () => {
		assert.throws(
			() => formatSseEvent(sseEvent(undefined)),
			/SSE event data must be JSON serializable/,
		);
	});

	it("rejects invalid SSE control-field values", () => {
		assert.equal(
			formatSseEvent(sseEvent({ ok: true }, { id: "abc", retry: 0 })),
			'id: abc\nretry: 0\ndata: {"ok":true}\n\n',
		);

		assert.throws(
			() => formatSseEvent(sseEvent({ ok: true }, { id: "a\u0000b" })),
			/SSE event id must not contain U\+0000, CR, or LF/,
		);

		for (const retry of [-1, 1.5, Number.NaN]) {
			assert.throws(
				() => formatSseEvent(sseEvent({ retry }, { retry })),
				/SSE event retry must be a non-negative safe integer/,
			);
		}
	});
});

describe("validateSseEvents", () => {
	it("validates event data while preserving metadata", async () => {
		async function* body() {
			yield sseEvent({ id: 123 }, { id: "event-1", retry: 1_000 });
		}

		const events = [];
		for await (const event of validateSseEvents(
			body(),
			z.object({ id: z.coerce.string() }),
		)) {
			events.push(event);
		}

		assert.equal(events[0]?.[sseEventMarker], true);
		assert.deepEqual(events[0]?.data, { id: "123" });
		assert.equal(events[0]?.id, "event-1");
		assert.equal(events[0]?.retry, 1_000);
	});
});
