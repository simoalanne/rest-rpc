import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { route } from "../contract/routeBuilder.ts";
import { initClient } from "./index.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type FetchCall = {
	url: string;
	init?: RequestInit;
};

const createResponseTestContract = () => ({
	todos: {
		create: route
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, z.object({ id: z.string(), title: z.string() })),
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, z.object({ id: z.string(), title: z.string() }))
			.response(404, z.object({ code: z.literal("not_found") })),
	},
});

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

const captureFetch = (
	response:
		| Response
		| ((
				url: URL | RequestInfo,
				init?: RequestInit,
		  ) => Response | Promise<Response>),
) => {
	const calls: FetchCall[] = [];

	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return typeof response === "function" ? response(url, init) : response;
	};

	return calls;
};

describe("ApiClient responses", () => {
	it("returns declared response metadata from route calls", async () => {
		captureFetch(jsonResponse({ code: "not_found" }, 404));
		const client = initClient(createResponseTestContract(), {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.get({ params: { id: "missing" } });

		assert.deepEqual(response, {
			status: 404,
			headers: new Headers(),
			responseHeaders: undefined,
			body: { code: "not_found" },
		});
	});

	it("returns declared response headers from route calls", async () => {
		captureFetch(
			new Response(JSON.stringify({ id: "todo-1" }), {
				status: 200,
				headers: {
					"content-type": "application/json",
					etag: "todo-etag",
					"x-count": "3",
				},
			}),
		);
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(200, z.object({ id: z.string() }), {
						headers: z.object({
							etag: z.string(),
							"x-count": z.coerce.number<number>(),
						}),
					}),
			},
		};
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		const response = await client.todos.get({ params: { id: "todo-1" } });

		assert.deepEqual(response.responseHeaders, {
			etag: "todo-etag",
			"x-count": 3,
		});
		assert.equal(response.headers.get("etag"), "todo-etag");
	});

	it("rejects undeclared response statuses without consuming their bodies", async () => {
		const rawResponse = jsonResponse({ code: "teapot" }, 418);
		captureFetch(rawResponse);
		const client = initClient(createResponseTestContract(), {
			baseUrl: "https://api.test",
		});

		await assert.rejects(
			() => client.todos.get({ params: { id: "todo-1" } }),
			/declared response/,
		);
		assert.equal(rawResponse.bodyUsed, false);
	});

	it("rejects an error response as an undeclared status", async () => {
		captureFetch(Response.error());
		const client = initClient(createResponseTestContract(), {
			baseUrl: "https://api.test",
		});

		await assert.rejects(
			() => client.todos.get({ params: { id: "todo-1" } }),
			/declared response/,
		);
	});

	it("returns declared responses without validating by default", async () => {
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(
						200,
						z.object({
							id: z.string(),
							createdAt: z
								.string()
								.datetime()
								.transform((value) => new Date(value)),
						}),
					),
			},
		};
		captureFetch(
			jsonResponse(
				{
					id: "todo-1",
					createdAt: "2026-08-10T00:00:00.000Z",
				},
				200,
			),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.get({ params: { id: "todo-1" } });

		assert.equal(response.status, 200);
		assert.equal(response.body.createdAt, "2026-08-10T00:00:00.000Z");
	});

	it("trusts declared response bodies by default", async () => {
		captureFetch(jsonResponse({ id: 123 }, 201));
		const client = initClient(createResponseTestContract(), {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.create({ body: { title: "Buy milk" } });
		assert.equal(response.status, 201);

		assert.deepEqual(response.body, { id: 123 });
	});

	it("validates declared response bodies when configured", async () => {
		captureFetch(jsonResponse({ id: 123 }, 201));
		const client = initClient(createResponseTestContract(), {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		await assert.rejects(() =>
			client.todos.create({ body: { title: "Buy milk" } }),
		);
	});

	it("returns transformed response output when validation is disabled", async () => {
		const responseSchema = z.object({
			id: z.string(),
			name: z
				.object({
					first: z.string(),
					last: z.string(),
				})
				.transform(({ first, last }) => `${first} ${last}`),
		});
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(200, responseSchema),
			},
		};
		const serverOutput = responseSchema.parse({
			id: "todo-1",
			name: {
				first: "Ada",
				last: "Lovelace",
			},
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.get({ params: { id: "todo-1" } });
		assert.equal(response.status, 200);

		assert.deepEqual(response.body, {
			id: "todo-1",
			name: "Ada Lovelace",
		});
	});

	it("rejects transformed response output that no longer matches response input when validation is enabled", async () => {
		const responseSchema = z.object({
			id: z.string(),
			name: z
				.object({
					first: z.string(),
					last: z.string(),
				})
				.transform(({ first, last }) => `${first} ${last}`),
		});
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(200, responseSchema),
			},
		};
		const serverOutput = responseSchema.parse({
			id: "todo-1",
			name: {
				first: "Ada",
				last: "Lovelace",
			},
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		await assert.rejects(() => client.todos.get({ params: { id: "todo-1" } }));
	});

	it("returns serialized Date transform output when validation is disabled", async () => {
		const responseSchema = z.object({
			createdAt: z
				.string()
				.datetime()
				.transform((value) => new Date(value)),
		});
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(200, responseSchema),
			},
		};
		const serverOutput = responseSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const response = await client.todos.get({ params: { id: "todo-1" } });
		assert.equal(response.status, 200);

		assert.equal(response.body.createdAt, "2026-08-10T00:00:00.000Z");
	});

	it("parses serialized Date transform output when validation is enabled", async () => {
		const responseSchema = z.object({
			createdAt: z
				.string()
				.datetime()
				.transform((value) => new Date(value)),
		});
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(200, responseSchema),
			},
		};
		const serverOutput = responseSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const response = await client.todos.get({ params: { id: "todo-1" } });
		assert.equal(response.status, 200);

		assert.ok(response.body.createdAt instanceof Date);
		assert.equal(
			response.body.createdAt.toISOString(),
			"2026-08-10T00:00:00.000Z",
		);
	});

	it("returns string response output when a Date response schema serializes to JSON", async () => {
		const responseSchema = z.object({
			id: z.string(),
			createdAt: z.date().transform((value) => value.toISOString()),
		});
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(200, responseSchema),
			},
		};
		const serverOutput = responseSchema.parse({
			id: "todo-1",
			createdAt: new Date("2026-08-10T00:00:00.000Z"),
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const response = await client.todos.get({ params: { id: "todo-1" } });
		assert.equal(response.status, 200);

		assert.deepEqual(response.body, {
			id: "todo-1",
			createdAt: "2026-08-10T00:00:00.000Z",
		});
	});

	it("returns serialized Date response output by default but rejects it when validation is enabled", async () => {
		const responseSchema = z.object({ createdAt: z.date() });
		const apiContract = {
			todos: {
				get: route
					.get("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(200, responseSchema),
			},
		};
		const serverOutput = responseSchema.parse({
			createdAt: new Date("2026-08-10T00:00:00.000Z"),
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const trustingClient = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const trustedResponse = await trustingClient.todos.get({
			params: { id: "todo-1" },
		});
		assert.equal(trustedResponse.status, 200);
		const trusted = trustedResponse.body;

		assert.equal(trusted.createdAt, "2026-08-10T00:00:00.000Z");

		captureFetch(jsonResponse(wireBody, 200));
		const validatingClient = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		await assert.rejects(() =>
			validatingClient.todos.get({ params: { id: "todo-1" } }),
		);
	});

	it("reads noBody responses as undefined", async () => {
		const apiContract = {
			todos: {
				remove: route
					.delete("/todos/:id")
					.params(z.object({ id: z.string() }))
					.response(204),
			},
		};
		captureFetch(new Response(null, { status: 204 }));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.remove({ params: { id: "todo-1" } });
		assert.equal(response.status, 204);

		assert.equal(response.body, undefined);
	});

	it("parses and validates declared custom text responses", async () => {
		const apiContract = {
			reports: {
				csv: route
					.get("/reports.csv")
					.response(200, z.string(), { contentType: "text/csv" }),
			},
		};
		captureFetch(
			new Response("id,title\n1,First\n", {
				status: 200,
				headers: { "content-type": "text/csv" },
			}),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		const response = await client.reports.csv();

		assert.equal(response.headers.get("content-type"), "text/csv");
		assert.equal("contentType" in response, false);
		assert.equal(response.body, "id,title\n1,First\n");
	});

	it("returns custom procedure data without HTTP metadata", async () => {
		const apiContract = {
			export: route.output(z.string(), { contentType: "text/plain" }),
		};
		captureFetch(
			new Response("report data", {
				status: 200,
				headers: { "content-type": "text/plain" },
			}),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		assert.equal(await client.export(), "report data");
	});

	it("uses a custom deserializer for custom responses", async () => {
		const apiContract = {
			reports: {
				binaryText: route.get("/reports/custom").response(200, z.string(), {
					contentType: "application/octet-stream",
				}),
			},
		};
		captureFetch(
			new Response("custom value", {
				headers: { "content-type": "application/octet-stream" },
			}),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			bodyCodecs: [
				{ match: () => true, deserialize: (response) => response.text() },
			],
			validateResponses: true,
		});

		const response = await client.reports.binaryText();

		assert.equal(response.body, "custom value");
	});

	it("does not infer streaming from a custom NDJSON content type", async () => {
		const apiContract = {
			events: route.get("/events").response(200, z.string(), {
				contentType: "application/x-ndjson",
			}),
		};
		captureFetch(
			new Response("event data", {
				headers: { "content-type": "application/x-ndjson" },
			}),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			bodyCodecs: [
				{ match: () => true, deserialize: (response) => response.text() },
			],
		});

		const response = await client.events();
		assert.equal(response.headers.get("content-type"), "application/x-ndjson");
		assert.equal("contentType" in response, false);
		assert.equal(response.body, "event data");
	});

	it("retains original headers without incoming content type metadata", async () => {
		const apiContract = {
			reports: {
				image: route.get("/reports/image").response(200, z.instanceof(Blob), {
					contentType: ["image/png", "image/jpeg"],
				}),
			},
		};
		captureFetch(
			new Response("jpeg bytes", {
				status: 200,
				headers: { "content-type": "image/jpeg; charset=binary" },
			}),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		const response = await client.reports.image();

		assert.equal(response.status, 200);
		assert.equal("contentType" in response, false);
		assert.equal(
			response.headers.get("content-type"),
			"image/jpeg; charset=binary",
		);
		assert.ok(response.body instanceof Blob);
		assert.equal(await response.body.text(), "jpeg bytes");
	});

	for (const validateResponses of [false, true]) {
		it(`checks transport acceptance independently of schema validation (${validateResponses})`, async () => {
			const rawResponse = new Response("{}", {
				headers: { "content-type": "application/json" },
			});
			captureFetch(rawResponse);
			const client = initClient(
				{
					csv: route
						.get("/csv")
						.response(200, z.string(), { contentType: "text/csv" }),
				},
				{
					baseUrl: "https://api.test",
					validateResponses,
					bodyCodecs: [
						{
							match: () => {
								throw new Error("Must reject before matching");
							},
							deserialize: () => "wrong",
						},
					],
				},
			);
			await assert.rejects(client.csv(), /unsupported response content-type/);
			assert.equal(rawResponse.bodyUsed, false);
		});
	}
});
