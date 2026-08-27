import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HttpRouteResult } from "./handleHttpRoute.ts";
import { handleHttpRouteResult } from "./handleHttpRouteResult.ts";
import { sseEvent } from "./sse.ts";
import { createFetchResponse } from "./fetchResponse.ts";

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

	it("sets custom response content-type before sending custom bodies", async () => {
		const headers: Record<string, unknown> = {};
		let sent: unknown;

		await handleHttpRouteResult(
			{
				kind: "custom",
				status: 200,
				contentType: "text/csv",
				body: "id\n1\n",
			},
			{
				setHeader: (name, value) => {
					headers[name] = value;
				},
				sendEmpty: () => undefined,
				sendJson: () => undefined,
				sendCustom: (status, body) => {
					sent = { status, body };
				},
				sendStream: () => undefined,
			},
		);

		assert.deepEqual(headers, {
			"content-type": "text/csv",
		});
		assert.deepEqual(sent, {
			status: 200,
			body: "id\n1\n",
		});
	});
});

describe("createFetchResponse", () => {
	it("creates json responses with headers", async () => {
		const response = await createFetchResponse({
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
		const response = await createFetchResponse({
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

		const response = await createFetchResponse({
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

		const response = await createFetchResponse({
			kind: "stream",
			status: 200,
			contentType: "text/plain",
			body: body(),
		} satisfies HttpRouteResult);

		assert.equal(response.headers.get("content-type"), "text/plain");
		assert.equal(await response.text(), "ab");
	});

	it("creates SSE stream responses", async () => {
		async function* body() {
			yield sseEvent({ id: "event-1" }, { id: "1", retry: 1_000 });
			yield sseEvent({ id: "event-2" });
		}

		const response = await createFetchResponse({
			kind: "stream",
			status: 200,
			contentType: "text/event-stream",
			mode: "sse",
			body: body(),
		} satisfies HttpRouteResult);

		assert.equal(response.headers.get("content-type"), "text/event-stream");
		assert.equal(
			await response.text(),
			'id: 1\nretry: 1000\ndata: {"id":"event-1"}\n\ndata: {"id":"event-2"}\n\n',
		);
	});

	it("appends array header values on fetch responses", async () => {
		const response = await createFetchResponse({
			kind: "empty",
			status: 204,
			headers: {
				"set-cookie": ["a=1", "b=2"],
			},
		});

		assert.equal(response.headers.get("set-cookie"), "a=1, b=2");
	});
});
