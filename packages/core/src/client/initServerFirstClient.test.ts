import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	initServerFirstClient,
	request,
	SERVER_FIRST_RESPONSE_KIND_HEADER,
} from "./index.ts";

type RuntimeRouteClient = {
	fetch: (...args: unknown[]) => Promise<unknown>;
	fetchResponse: (...args: unknown[]) => Promise<{
		body: unknown;
		contentType?: string;
		declared: true;
		status: number;
	}>;
};

type RuntimeClient = {
	get: (path: string) => RuntimeRouteClient;
	post: (path: string) => RuntimeRouteClient;
};

type FetchCall = {
	url: string;
	init?: RequestInit;
};

const response = (kind: string, body?: BodyInit | null, status = 200) =>
	new Response(body, {
		status,
		headers: { [SERVER_FIRST_RESPONSE_KIND_HEADER]: `v=1 kind=${kind}` },
	});

const createClient = (
	responseFactory: () => Response,
	options: { nextFetchTags?: { enabled: boolean; tagPrefix?: string } } = {},
) => {
	const calls: FetchCall[] = [];
	const client = initServerFirstClient<never>({
		baseUrl: "https://api.test",
		fetch: async (url, init) => {
			calls.push({ url: String(url), init });
			return responseFactory();
		},
		...options,
	}) as unknown as RuntimeClient;

	return { calls, client };
};

describe("initServerFirstClient", () => {
	it("selects a method and path and delegates ordinary requests to fetch", async () => {
		const { calls, client } = createClient(() =>
			response("json", JSON.stringify({ id: "todo-1" }), 201),
		);

		const result = await client.post("/accounts/:accountId/todos").fetch({
			body: { title: "Todo" },
			headers: { "x-request-id": "request-1" },
			params: { accountId: "account-1" },
			query: { notify: true },
		});

		assert.deepEqual(result, { id: "todo-1" });
		assert.equal(
			calls[0]?.url,
			"https://api.test/accounts/account-1/todos?notify=true",
		);
		assert.equal(calls[0]?.init?.method, "POST");
		assert.equal(calls[0]?.init?.body, JSON.stringify({ title: "Todo" }));
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "application/json",
			"x-request-id": "request-1",
		});
	});

	it("serializes explicit server-first request encodings", async () => {
		const { calls, client } = createClient(() => response("empty", null, 204));

		await client.post("/form").fetch({
			body: request.formBody({ title: "Todo", tags: ["docs", "api"] }),
		});
		await client.post("/multipart").fetch({
			body: request.multipartBody({ title: "Todo", tags: ["docs", "api"] }),
		});
		await client.get("/search").fetch({
			query: request.jsonQuery({ page: 2, filters: { tag: "open" } }),
		});
		await client.post("/custom").fetch({
			body: request.customBody("text/csv", "id,title\n1,Todo\n"),
		});
		await client.post("/fetch-managed").fetch({
			body: request.customBody(new URLSearchParams({ title: "Todo" })),
		});

		assert.equal(String(calls[0]?.init?.body), "title=Todo&tags=docs&tags=api");
		assert.deepEqual(Array.from((calls[1]!.init!.body as FormData).entries()), [
			["title", "Todo"],
			["tags", "docs"],
			["tags", "api"],
		]);
		assert.equal(
			calls[2]?.url,
			"https://api.test/search?query=%7B%22page%22%3A2%2C%22filters%22%3A%7B%22tag%22%3A%22open%22%7D%7D",
		);
		assert.equal(calls[3]?.init?.body, "id,title\n1,Todo\n");
		assert.deepEqual(calls[3]?.init?.headers, { "content-type": "text/csv" });
		assert.ok(calls[4]?.init?.body instanceof URLSearchParams);
		assert.deepEqual(calls[4]?.init?.headers, {});
	});

	it("requires valid response-kind metadata", async () => {
		const missing = createClient(() => new Response("{}"));
		await assert.rejects(
			missing.client.get("/todos").fetch(),
			/missing required X-Rest-Rpc-Response-Kind header/,
		);

		const invalid = createClient(
			() =>
				new Response("{}", {
					headers: { [SERVER_FIRST_RESPONSE_KIND_HEADER]: "v=2 kind=json" },
				}),
		);
		await assert.rejects(
			invalid.client.get("/todos").fetch(),
			/invalid server-first response kind/,
		);
	});

	it("requires content-type metadata for custom responses", async () => {
		const { client } = createClient(
			() =>
				new Response(null, {
					headers: {
						[SERVER_FIRST_RESPONSE_KIND_HEADER]: "v=1 kind=custom",
					},
				}),
		);

		await assert.rejects(
			client.get("/export").fetchResponse(),
			/missing required Content-Type header/,
		);
	});

	it("reads empty, NDJSON, and custom responses", async () => {
		const empty = createClient(() => response("empty", null, 204));
		assert.equal(await empty.client.get("/empty").fetch(), undefined);

		const ndjson = createClient(() =>
			response("ndjson", '{"id":"one"}\n{"id":"two"}\n'),
		);
		const stream = (await ndjson.client
			.get("/stream")
			.fetch()) as AsyncIterable<{
			id: string;
		}>;
		const values = [];
		for await (const value of stream) values.push(value);
		assert.deepEqual(values, [{ id: "one" }, { id: "two" }]);

		const custom = createClient(
			() =>
				new Response("csv", {
					headers: {
						"content-type": "text/csv",
						[SERVER_FIRST_RESPONSE_KIND_HEADER]: "v=1 kind=custom",
					},
				}),
		);
		const customResponse = await custom.client.get("/export").fetchResponse();
		assert.ok(customResponse.body instanceof Response);
		assert.equal(customResponse.contentType, "text/csv");
	});

	it("uses method:path identities for automatic Next.js tags", async () => {
		const { calls, client } = createClient(() => response("empty", null, 204), {
			nextFetchTags: { enabled: true, tagPrefix: "api" },
		});

		await client.get("/todos/:id").fetch({
			params: { id: "todo-1" },
			query: { include: "labels" },
		});

		assert.deepEqual(
			(calls[0]!.init as RequestInit & { next?: { tags?: string[] } }).next
				?.tags,
			[
				"api:get:/todos/:id:params:%7B%22id%22%3A%22todo-1%22%7D:query:%7B%22include%22%3A%22labels%22%7D",
				"api:get:/todos/:id",
			],
		);
	});
});
