import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customBody, stream } from "@rest-rpc/core/contract";
import z from "zod";
import { handleHttpRoute } from "./handleHttpRoute.ts";

describe("handleHttpRoute custom responses", () => {
	it("normalizes custom single bodies after validating without serializing them", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/report.csv",
				responses: {
					200: customBody({
						contentType: "text/csv",
						schema: z.string(),
					}),
				},
			},
			() => ({ status: 200, body: "id,title\n1,First\n" }),
			{ request: {}, context: {} },
		);

		assert.equal(result.kind, "custom");
		assert.equal(result.status, 200);
		assert.equal(result.contentType, "text/csv");
		assert.equal(result.body, "id,title\n1,First\n");
	});

	it("validates custom single response bodies", async () => {
		await assert.rejects(() =>
			handleHttpRoute(
				{
					method: "GET",
					path: "/report.csv",
					responses: {
						200: customBody({
							contentType: "text/csv",
							schema: z.number(),
						}),
					},
				},
				() => ({ status: 200, body: "id,title\n1,First\n" }),
				{ request: {}, context: {} },
			),
		);
	});

	it("normalizes custom streamed bodies after validating without framing chunks", async () => {
		async function* rows() {
			yield "id,title\n";
			yield "1,First\n";
		}

		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/report.csv",
				responses: {
					200: stream(
						customBody({
							contentType: "text/csv",
							schema: z.string(),
						}),
					),
				},
			},
			() => ({ status: 200, body: rows() }),
			{ request: {}, context: {} },
		);

		assert.equal(result.kind, "stream");
		assert.equal(result.status, 200);
		assert.equal(result.contentType, "text/csv");

		const chunks = [];
		for await (const chunk of result.body) chunks.push(chunk);

		assert.deepEqual(chunks, ["id,title\n", "1,First\n"]);
	});

	it("validates custom streamed response chunks", async () => {
		async function* rows() {
			yield "id,title\n";
		}

		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/report.csv",
				responses: {
					200: stream(
						customBody({
							contentType: "text/csv",
							schema: z.number(),
						}),
					),
				},
			},
			() => ({ status: 200, body: rows() }),
			{ request: {}, context: {} },
		);

		assert.equal(result.kind, "stream");
		await assert.rejects(async () => {
			for await (const _chunk of result.body) {
				_chunk;
			}
		});
	});
});
