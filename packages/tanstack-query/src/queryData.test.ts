import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchQueryData } from "./queryData.ts";

describe("fetchQueryData", () => {
	it("returns declared success response envelopes", async () => {
		const calls: unknown[][] = [];
		const response = await fetchQueryData(
			async (...args) => {
				calls.push(args);
				return {
					status: 200,
					body: { id: "item-1" },
				};
			},
			{ id: "item-1" },
			{ signal: "signal-value" as any },
		);

		assert.deepEqual(response, {
			status: 200,
			body: { id: "item-1" },
		});
		assert.deepEqual(calls, [[{ id: "item-1" }, { signal: "signal-value" }]]);
	});

	it("returns strict declared success response envelopes", async () => {
		const response = await fetchQueryData(
			async () => ({
				status: 200,
				body: { id: "item-1" },
			}),
			undefined,
		);

		assert.deepEqual(response, {
			status: 200,
			body: { id: "item-1" },
		});
	});

	it("forwards undefined and options for routes without request input", async () => {
		const calls: unknown[][] = [];
		await fetchQueryData(
			async (...args) => {
				calls.push(args);
				return {
					status: 200,
					body: { items: [] },
				};
			},
			undefined,
			{ signal: "list-signal" as any },
		);

		assert.deepEqual(calls, [[undefined, { signal: "list-signal" }]]);
	});

	it("throws declared non-success responses", async () => {
		await assert.rejects(
			() =>
				fetchQueryData(
					async () => ({
						status: 409,
						body: { code: "ITEM_EXISTS" },
					}),
					undefined,
				),
			{
				status: 409,
				body: { code: "ITEM_EXISTS" },
			},
		);
	});

	it("throws undeclared response envelopes unchanged", async () => {
		const error = {
			status: 500,
			rawResponse: new Response("server exploded", { status: 500 }),
		};

		await assert.rejects(
			() => fetchQueryData(async () => error, undefined),
			error,
		);
	});

	it("throws undeclared 2xx responses instead of treating them as query data", async () => {
		const rawResponse = new Response("unknown success", { status: 299 });
		const error = {
			status: 299,
			rawResponse,
		};

		await assert.rejects(
			() => fetchQueryData(async () => error, undefined),
			error,
		);
	});

	it("normalizes unknown thrown values to Error", async () => {
		await assert.rejects(
			() =>
				fetchQueryData(async () => {
					throw "boom";
				}, undefined),
			(error: unknown) =>
				error instanceof Error &&
				error.message === "API request failed" &&
				error.cause === "boom",
		);
	});
});
