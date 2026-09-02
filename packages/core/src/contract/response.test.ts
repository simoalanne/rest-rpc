import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRouteResponses } from "./response.ts";

describe("getRouteResponses", () => {
	it("returns non-empty route responses", () => {
		const responses = { 204: { kind: "noBody" as const } };

		assert.equal(getRouteResponses({ path: "/ping", responses }), responses);
	});

	it("rejects missing route responses", () => {
		assert.throws(
			() => getRouteResponses({ path: "/ping" }),
			/missing responses/,
		);
	});

	it("rejects empty route responses", () => {
		assert.throws(
			() => getRouteResponses({ path: "/ping", responses: {} }),
			/must declare at least one response schema/,
		);
	});
});
