import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { IntegrationAdapter } from "../adapters/types.ts";
import { createIntegrationClient } from "../fixtures/client.ts";
import type { StartedServer } from "../fixtures/listen.ts";

type IntegrationClient = ReturnType<typeof createIntegrationClient>;

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

export const runClientHttpSuite = (adapter: IntegrationAdapter) => {
	describe(`${adapter.name} generated fetch client`, () => {
		let server: StartedServer;
		let client: IntegrationClient;

		before(async () => {
			server = await adapter.start();
			client = createIntegrationClient(server.origin);
		});

		after(async () => {
			await server.close();
		});

		it("receives 204 noBody responses as undefined", async () => {
			assert.equal(await client.health.fetch(), undefined);
		});

		it("receives JSON success bodies", async () => {
			assert.deepEqual(await client.items.list.fetch({ search: "matched" }), [
				{ id: "item-1", title: "matched" },
				{ id: "item-2", title: "Second item" },
			]);
		});

		it("round trips params, query, headers, and JSON body values", async () => {
			const body = await client.echo.json.fetch({
				id: "echo-1",
				search: "needle",
				limit: 10,
				"x-test-token": "token-1",
				title: "Echo title",
				count: 3,
			});

			assert.deepEqual(body, {
				params: { id: "echo-1" },
				query: { search: "needle", limit: "10" },
				headers: { "x-test-token": "token-1" },
				body: { title: "Echo title", count: 3 },
				context: { adapter: adapter.name, kind: "http" },
			});
		});

		it("receives declared 404 responses through fetchResponse", async () => {
			const response = await client.items.get.fetchResponse({ id: "missing" });

			assert.equal(response.declared, true);
			assert.equal(response.status, 404);
			assert.deepEqual(response.body, {
				code: "not_found",
				id: "missing",
			});
		});

		it("rejects fetch() for declared non-success responses", async () => {
			await assert.rejects(
				() => client.items.get.fetch({ id: "missing" }),
				/declared success response/,
			);
		});

		it("receives 201 create responses", async () => {
			const response = await client.items.create.fetchResponse({
				title: "Created item",
			});

			assert.equal(response.declared, true);
			assert.equal(response.status, 201);
			assert.deepEqual(response.body, {
				id: "created-item",
				title: "Created item",
			});
		});

		it("receives multiple success statuses", async () => {
			const ok = await client.items.publish.fetchResponse({
				id: "item-1",
				async: false,
			});

			assert.equal(ok.declared, true);
			assert.equal(ok.status, 200);
			assert.deepEqual(ok.body, { id: "item-1", title: "Published item" });

			const accepted = await client.items.publish.fetchResponse({
				id: "item-1",
				async: true,
			});

			assert.equal(accepted.declared, true);
			assert.equal(accepted.status, 202);
			assert.deepEqual(accepted.body, {
				queued: true,
				id: "item-1",
			});
		});

		it("sends and receives custom text/plain bodies", async () => {
			const response = await client.echo.text.fetchResponse({
				id: "note-1",
				body: "hello over real HTTP",
			});

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			assertResponseBody(response.body);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^text\/plain/,
			);
			assert.equal(await response.body.text(), "hello over real HTTP");
		});

		it("receives custom response bodies as native Response objects", async () => {
			const response = await client.responses.text.fetchResponse();

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			assertResponseBody(response.body);
			assert.match(
				response.body.headers.get("content-type") ?? "",
				/^text\/plain/,
			);
			assert.equal(await response.body.text(), "plain response");
		});

		it("receives response headers", async () => {
			const response = await client.responses.headers.fetchResponse();

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			assert.deepEqual(response.body, { ok: true });
			assert.equal(
				response.headers.get("x-integration-result"),
				"header-value",
			);
		});

		it("receives NDJSON streams as async iterables", async () => {
			const stream = await client.streams.ndjson.fetch();

			assert.deepEqual(await collectAsyncIterable(stream), [
				{ id: "event-1", index: 1 },
				{ id: "event-2", index: 2 },
			]);
		});

		it("receives raw text streams as native Response objects", async () => {
			const response = await client.streams.text.fetchResponse();

			assert.equal(response.declared, true);
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
