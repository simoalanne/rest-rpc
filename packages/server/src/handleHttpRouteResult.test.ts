import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERVER_FIRST_RESPONSE_KIND_HEADER } from "@rest-rpc/core/client";
import { handleHttpRouteResult } from "./handleHttpRouteResult.ts";

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
			[SERVER_FIRST_RESPONSE_KIND_HEADER]: "v=1 kind=json",
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
			[SERVER_FIRST_RESPONSE_KIND_HEADER]: "v=1 kind=custom",
			"content-type": "text/csv",
		});
		assert.deepEqual(sent, {
			status: 200,
			body: "id\n1\n",
		});
	});
});
