import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { StartedServer } from "../harness/listen.ts";

type BodyParsingSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

const readJson = async (response: Response) =>
	response.json() as Promise<unknown>;

const assertDefaultValidationErrorResponse = async (response: Response) => {
	assert.equal(response.status, 400);
	assert.match(
		response.headers.get("content-type") ?? "",
		/^application\/json/,
	);

	const body = await readJson(response);
	assert.equal(typeof body, "object");
	assert.notEqual(body, null);
	assert.equal(
		(body as { message?: unknown }).message,
		"Request validation failed. Check the validationErrors field for details.",
	);
	const validationErrors = (body as { validationErrors?: unknown })
		.validationErrors;
	assert.ok(Array.isArray(validationErrors));
	assert.ok(validationErrors.length > 0);
};

export const runBodyParsingSuite = (adapter: BodyParsingSuiteAdapter) => {
	describe(`${adapter.name} body parsing integration`, () => {
		let server: StartedServer;

		before(async () => {
			server = await adapter.start();
		});

		after(async () => {
			await server.close();
		});

		it("parses standard JSON request bodies", async () => {
			const response = await fetch(`${server.origin}/body-parsing/json`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					count: 3,
					title: "Parsed JSON",
				}),
			});

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				count: 3,
				title: "Parsed JSON",
			});
		});

		it("parses custom text/plain request bodies as raw text", async () => {
			const response = await fetch(`${server.origin}/body-parsing/text`, {
				method: "POST",
				headers: {
					"content-type": "text/plain",
				},
				body: '{"not":"json"}',
			});

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				body: '{"not":"json"}',
			});
		});

		it("parses custom JSON request bodies with content-type parameters", async () => {
			const response = await fetch(
				`${server.origin}/body-parsing/custom-json`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json; charset=utf-8",
					},
					body: JSON.stringify({
						count: 5,
						nested: { ok: true },
					}),
				},
			);

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				count: 5,
				ok: true,
			});
		});

		it("parses custom application/octet-stream bodies as bytes", async () => {
			const response = await fetch(`${server.origin}/body-parsing/binary`, {
				method: "POST",
				headers: {
					"content-type": "application/octet-stream",
				},
				body: new Uint8Array([0, 1, 127, 128, 255]),
			});

			assert.equal(response.status, 200);
			assert.deepEqual(await readJson(response), {
				byteLength: 5,
				bytes: [0, 1, 127, 128, 255],
			});
		});

		it("rejects text bodies sent to JSON routes", async () => {
			const response = await fetch(`${server.origin}/body-parsing/json`, {
				method: "POST",
				headers: {
					"content-type": "text/plain",
				},
				body: JSON.stringify({
					count: 3,
					title: "Wrong parser",
				}),
			});

			await assertDefaultValidationErrorResponse(response);
		});

		it("rejects binary bodies sent to text routes", async () => {
			const response = await fetch(`${server.origin}/body-parsing/text`, {
				method: "POST",
				headers: {
					"content-type": "application/octet-stream",
				},
				body: new Uint8Array([65, 66, 67]),
			});

			await assertDefaultValidationErrorResponse(response);
		});

		it("rejects text bodies sent to binary routes", async () => {
			const response = await fetch(`${server.origin}/body-parsing/binary`, {
				method: "POST",
				headers: {
					"content-type": "text/plain",
				},
				body: "ABC",
			});

			await assertDefaultValidationErrorResponse(response);
		});

		it("ignores supplied bodies for routes declared as noBody", async () => {
			const response = await fetch(`${server.origin}/body-parsing/no-body`, {
				method: "DELETE",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ ignored: true }),
			});

			assert.equal(response.status, 204);
			assert.equal(await response.text(), "");
		});
	});
};
