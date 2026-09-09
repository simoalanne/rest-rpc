import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { integrationContract } from "./contract.ts";

type IntegrationClient = ReturnType<
	typeof initClient<typeof integrationContract>
>;

type ClientHttpSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

type ResponseBody = Response & {
	headers: {
		get(name: string): string | null;
	};
	text(): Promise<string>;
};

const collectAsyncIterable = async <T>(iterable: AsyncIterable<T>) => {
	const items: T[] = [];
	for await (const item of iterable) items.push(item);
	return items;
};

function assertResponseBody(body: unknown): asserts body is ResponseBody {
	assert.equal(typeof body, "object");
	assert.notEqual(body, null);
	assert.equal(typeof (body as ResponseBody).text, "function");
	assert.equal(typeof (body as ResponseBody).headers?.get, "function");
}

export const runClientHttpSuite = (adapter: ClientHttpSuiteAdapter) => {
	describe(`${adapter.name} generated fetch client`, () => {
		let server: StartedServer;
		let client: IntegrationClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(integrationContract, { baseUrl: server.origin });
		});

		after(async () => {
			await server.close();
		});

		it("receives 204 noBody responses as undefined", async () => {
			const healthResponse = await client.health();
			assert.equal(healthResponse.status, 204);
			assert.equal(healthResponse.body, undefined);
		});

		it("receives JSON success bodies", async () => {
			const listResponse = await client.items.list({ search: "matched" });
			assert.equal(listResponse.status, 200);
			assert.deepEqual(listResponse.body, [
				{ id: "item-1", title: "matched" },
				{ id: "item-2", title: "Second item" },
			]);
		});

		it("round trips params, query, headers, and JSON body values", async () => {
			const bodyResponse = await client.echo.json({
				id: "echo-1",
				search: "needle",
				limit: 10,
				"x-test-token": "token-1",
				title: "Echo title",
				count: 3,
			});
			assert.equal(bodyResponse.status, 200);
			const body = bodyResponse.body;

			assert.deepEqual(body, {
				params: { id: "echo-1" },
				query: { search: "needle", limit: "10" },
				headers: { "x-test-token": "token-1" },
				body: { title: "Echo title", count: 3 },
				context: { nonEmpty: true },
			});
		});

		it("round trips encoded path params and reserved query characters", async () => {
			const bodyResponse = await client.echo.json({
				id: "encoded id/with slash",
				search: "a+b & c=d ? done",
				"x-test-token": "token-1",
				title: "Encoded values",
				count: 4,
			});
			assert.equal(bodyResponse.status, 200);
			const body = bodyResponse.body;

			assert.deepEqual(body, {
				params: { id: "encoded id/with slash" },
				query: { search: "a+b & c=d ? done" },
				headers: { "x-test-token": "token-1" },
				body: { title: "Encoded values", count: 4 },
				context: { nonEmpty: true },
			});
		});

		it("receives declared 404 responses as values", async () => {
			const response = await client.items.get({ id: "missing" });

			assert.equal(response.status, 404);
			assert.deepEqual(response.body, {
				code: "not_found",
				id: "missing",
			});
		});

		it("receives 201 create responses", async () => {
			const response = await client.items.create({
				title: "Created item",
			});

			assert.equal(response.status, 201);
			assert.deepEqual(response.body, {
				id: "created-item",
				title: "Created item",
			});
		});

		it("receives multiple success statuses", async () => {
			const ok = await client.items.publish({
				id: "item-1",
				async: false,
			});

			assert.equal(ok.status, 200);
			assert.deepEqual(ok.body, { id: "item-1", title: "Published item" });

			const accepted = await client.items.publish({
				id: "item-1",
				async: true,
			});

			assert.equal(accepted.status, 202);
			assert.deepEqual(accepted.body, {
				queued: true,
				id: "item-1",
			});
		});

		it("sends and receives custom text/plain bodies", async () => {
			const response = await client.echo.text({
				id: "note-1",
				body: "hello over real HTTP",
			});

			assert.equal(response.status, 200);
			assertResponseBody(response.body);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^text\/plain/,
			);
			assert.equal(await response.body.text(), "hello over real HTTP");
		});

		it("receives custom response bodies as native Response objects", async () => {
			const response = await client.responses.text();

			assert.equal(response.status, 200);
			assertResponseBody(response.body);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^text\/plain/,
			);
			assert.equal(await response.body.text(), "plain response");
		});

		it("receives Uint8Array custom response bodies as exact bytes", async () => {
			const response = await client.responses.binary();

			assert.equal(response.status, 200);
			assertResponseBody(response.body);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^application\/octet-stream/,
			);
			assert.deepEqual(
				Array.from(new Uint8Array(await response.body.arrayBuffer())),
				[0, 1, 127, 128, 255],
			);
		});

		it("receives response headers", async () => {
			const response = await client.responses.headers();

			assert.equal(response.status, 200);
			assert.deepEqual(response.body, { ok: true });
			assert.equal(
				response.responseHeaders["x-declared-result"],
				"declared-value",
			);
			assert.equal(response.headers.get("x-declared-result"), "declared-value");
			assert.equal(response.headers.get("x-optional-result"), null);
		});

		it("receives NDJSON streams as async iterables", async () => {
			const streamResponse = await client.streams.ndjson();
			assert.equal(streamResponse.status, 200);
			const stream = streamResponse.body;

			assert.deepEqual(await collectAsyncIterable(stream), [
				{ id: "event-1", index: 1 },
				{ id: "event-2", index: 2 },
			]);
		});

		it("receives raw text streams as native Response objects", async () => {
			const response = await client.streams.text();

			assert.equal(response.status, 200);
			assertResponseBody(response.body);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^text\/plain/,
			);
			assert.equal(await response.body.text(), "alpha\nbeta\n");
		});
	});
};
