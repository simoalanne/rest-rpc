import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "@rest-rpc/core";
import { type as schemaType } from "@rest-rpc/core/standard-schema";
import { fetchQueryData } from "./queryData.ts";

const routeWithoutRequest = route
	.get("/items")
	.response(200, schemaType<unknown>());

const routeWithRequest = route
	.get("/items/:id")
	.params(schemaType<{ id: string }>())
	.response(200, schemaType<unknown>());

describe("fetchQueryData", () => {
	it("returns declared success response envelopes", async () => {
		const calls: unknown[][] = [];
		const response = await fetchQueryData(
			async (...args) => {
				calls.push(args);
				return {
					declared: true,
					status: 200,
					body: { id: "item-1" },
				};
			},
			routeWithRequest,
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
			routeWithoutRequest,
			undefined,
		);

		assert.deepEqual(response, {
			status: 200,
			body: { id: "item-1" },
		});
	});

	it("forwards options as the first argument for routes without request input", async () => {
		const calls: unknown[][] = [];
		await fetchQueryData(
			async (...args) => {
				calls.push(args);
				return {
					declared: true,
					status: 200,
					body: { items: [] },
				};
			},
			routeWithoutRequest,
			undefined,
			{ signal: "list-signal" as any },
		);

		assert.deepEqual(calls, [[{ signal: "list-signal" }]]);
	});

	it("throws declared non-success responses", async () => {
		await assert.rejects(
			() =>
				fetchQueryData(
					async () => ({
						declared: true,
						status: 409,
						body: { code: "ITEM_EXISTS" },
					}),
					routeWithoutRequest,
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
			declared: false,
			status: 500,
			body: "server exploded",
		};

		await assert.rejects(
			() => fetchQueryData(async () => error, routeWithoutRequest, undefined),
			error,
		);
	});

	it("normalizes unknown thrown values to Error", async () => {
		await assert.rejects(
			() =>
				fetchQueryData(
					async () => {
						throw "boom";
					},
					routeWithoutRequest,
					undefined,
				),
			(error: unknown) =>
				error instanceof Error &&
				error.message === "API request failed" &&
				error.cause === "boom",
		);
	});
});
