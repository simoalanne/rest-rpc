import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HttpRouteResult } from "./handleHttpRoute.ts";
import { handleHttpRouteResult } from "./handleHttpRouteResult.ts";
import { createWebResponse } from "./webResponse.ts";

describe("handleHttpRouteResult", () => {
	it("applies headers and sends json responses", async () => {
		const headers: Record<string, unknown> = {};
		let sent: unknown;

		await handleHttpRouteResult(
			{
				kind: "json",
				status: 201,
				headers: {
					"x-request-id": "request-1",
					"x-skip": undefined,
				},
				body: { id: "todo-1" },
			},
			{
				setHeader: (name, value) => {
					headers[name] = value;
				},
				sendEmpty: () => undefined,
				sendJson: (status, body) => {
					sent = { status, body };
				},
				sendCustom: () => undefined,
				sendStream: () => undefined,
			},
		);

		assert.deepEqual(headers, {
			"x-request-id": "request-1",
		});
		assert.deepEqual(sent, {
			status: 201,
			body: { id: "todo-1" },
		});
	});

	it("passes default ndjson stream metadata", async () => {
		async function* body() {
			yield { id: "todo-1" };
		}

		let streamInput: unknown;

		await handleHttpRouteResult(
			{ kind: "stream", status: 200, body: body() },
			{
				setHeader: () => undefined,
				sendEmpty: () => undefined,
				sendJson: () => undefined,
				sendCustom: () => undefined,
				sendStream: (input) => {
					streamInput = input;
				},
			},
		);

		assert.deepEqual(
			{
				status: (streamInput as { status: number }).status,
				contentType: (streamInput as { contentType: string }).contentType,
				mode: (streamInput as { mode: string }).mode,
			},
			{
				status: 200,
				contentType: "application/x-ndjson",
				mode: "ndjson",
			},
		);
	});
});

describe("createWebResponse", () => {
	it("creates json responses with headers", async () => {
		const response = await createWebResponse({
			kind: "json",
			status: 200,
			headers: {
				"x-request-id": "request-1",
			},
			body: { ok: true },
		});

		assert.equal(response.status, 200);
		assert.equal(response.headers.get("x-request-id"), "request-1");
		assert.equal(response.headers.get("content-type"), "application/json");
		assert.deepEqual(await response.json(), { ok: true });
	});

	it("preserves explicit json content-type headers", async () => {
		const response = await createWebResponse({
			kind: "json",
			status: 200,
			headers: {
				"content-type": "application/vnd.api+json",
			},
			body: { ok: true },
		});

		assert.equal(
			response.headers.get("content-type"),
			"application/vnd.api+json",
		);
		assert.deepEqual(await response.json(), { ok: true });
	});

	it("creates ndjson stream responses", async () => {
		async function* body() {
			yield { id: "todo-1" };
			yield { id: "todo-2" };
		}

		const response = await createWebResponse({
			kind: "stream",
			status: 200,
			body: body(),
		});

		assert.equal(response.status, 200);
		assert.equal(response.headers.get("content-type"), "application/x-ndjson");
		assert.equal(await response.text(), '{"id":"todo-1"}\n{"id":"todo-2"}\n');
	});

	it("creates raw custom stream responses", async () => {
		async function* body() {
			yield "a";
			yield "b";
		}

		const response = await createWebResponse({
			kind: "stream",
			status: 200,
			contentType: "text/plain",
			body: body(),
		} satisfies HttpRouteResult);

		assert.equal(response.headers.get("content-type"), "text/plain");
		assert.equal(await response.text(), "ab");
	});
});
