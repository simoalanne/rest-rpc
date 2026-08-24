import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { testContract } from "../../test/factories/contract.ts";
import { customBody, formBody, multipartBody } from "./body.ts";
import { jsonQuery } from "./request.ts";
import { groupRequestInput, validateContract } from "./validate.ts";

describe("validateContract", () => {
	it("populates request keys from request schemas", () => {
		const contract = validateContract(
			testContract({
				path: "/search/:id",
				pathParams: z.object({ id: z.string() }),
				query: z.object({ q: z.string().optional() }),
				body: z.object({ title: z.string() }),
			}),
		);

		assert.deepEqual(contract.search.find.requestKeys, {
			id: "pathParams",
			q: "query",
			title: "body",
		});
	});

	it("does not flatten jsonQuery schema keys into request keys", () => {
		const contract = validateContract(
			testContract({
				query: jsonQuery(
					z.object({
						page: z.number(),
						filters: z.object({ tag: z.string() }),
					}),
				),
			}),
		);

		assert.deepEqual(contract.search.find.requestKeys, {});
	});

	it("populates request keys from schema record request declarations", () => {
		const contract = validateContract(
			testContract({
				path: "/search/:id",
				pathParams: {
					id: z.string(),
				},
				query: {
					q: z.string().optional(),
				},
				body: {
					title: z.string(),
				},
				headers: {
					"x-request-id": z.string(),
				},
			}),
		);

		assert.deepEqual(contract.search.find.requestKeys, {
			id: "pathParams",
			q: "query",
			title: "body",
			"x-request-id": "headers",
		});
	});

	it("preserves existing request keys", () => {
		const contract = validateContract(
			testContract({
				path: "/search/:id",
				pathParams: z.object({ id: z.string() }),
				requestKeys: {
					id: "pathParams",
				},
			}),
		);

		assert.deepEqual(contract.search.find.requestKeys, {
			id: "pathParams",
		});
	});

	it("rejects duplicate flattened request keys", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/search/:id",
						pathParams: z.object({ id: z.string() }),
						query: z.object({ id: z.string() }),
					}),
				),
			/duplicate request keys/,
		);
	});

	it("rejects reserved context request keys", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						query: z.object({ context: z.string() }),
					}),
				),
			/reserved request key "context"/,
		);
	});

	it("rejects reserved content-type header keys", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						headers: {
							"Content-Type": z.string(),
						},
					}),
				),
			/reserved header key "Content-Type"/,
		);
	});

	it("rejects header keys that differ only by case", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						headers: {
							"x-request-id": z.string(),
							"X-Request-ID": z.string(),
						},
					}),
				),
			/duplicate header keys that differ only by case/,
		);
	});

	it("rejects reserved content-type header request keys", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						requestKeys: {
							"content-type": "headers",
						},
					}),
				),
			/reserved header key "content-type"/,
		);
	});

	it("rejects header request keys that differ only by case", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						requestKeys: {
							"x-request-id": "headers",
							"X-Request-ID": "headers",
						},
					}),
				),
			/duplicate header keys that differ only by case/,
		);
	});

	it("rejects body keys in query or pathParams for custom request bodies", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/uploads/:body",
						pathParams: z.object({ body: z.string() }),
						body: customBody({
							schema: z.instanceof(Uint8Array),
							contentType: "application/octet-stream",
						}),
					}),
				),
			/has a "body" key in query or pathParams/,
		);
	});

	it("rejects body keys in query or pathParams for form request bodies", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/forms/:body",
						pathParams: z.object({ body: z.string() }),
						body: formBody(z.object({ title: z.string() })),
					}),
				),
			/has a "body" key in query or pathParams/,
		);
	});

	it("rejects body keys in query or pathParams for multipart request bodies", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/uploads/:body",
						pathParams: z.object({ body: z.string() }),
						body: multipartBody({
							fields: { title: z.string() },
							arrayKeys: [],
						}),
					}),
				),
			/has a "body" key in query or pathParams/,
		);
	});

	it("rejects query keys in other segments for JSON query values", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/search/:query",
						pathParams: z.object({ query: z.string() }),
						query: jsonQuery(z.object({ page: z.number() })),
					}),
				),
			/has a "query" key in body, pathParams or headers/,
		);
	});

	it("allows body keys in query or pathParams without custom request bodies", () => {
		const contract = validateContract(
			testContract({
				path: "/search/:body",
				pathParams: z.object({ body: z.string() }),
			}),
		);

		assert.deepEqual(contract.search.find.requestKeys, {
			body: "pathParams",
		});
	});

	it("rejects path params without pathParams request keys", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/search/:id",
						query: z.object({ q: z.string() }),
					}),
				),
			/without a matching pathParams schema key/,
		);
	});

	it("rejects path params when no request is declared", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/search/:id",
					}),
				),
			/without a matching pathParams schema key/,
		);
	});

	it("rejects pathParams request keys without matching path params", () => {
		assert.throws(
			() =>
				validateContract(
					testContract({
						path: "/search",
						pathParams: z.object({ id: z.string() }),
					}),
				),
			/without a matching path param/,
		);
	});
});

describe("groupRequestInput", () => {
	it("groups flattened request input from request key metadata", () => {
		const route = testContract({
			path: "/search/:id",
			body: z.object({ title: z.string() }),
			query: z.object({ q: z.string() }),
			pathParams: z.object({ id: z.string() }),
			headers: { "x-request-id": z.string() },
			requestKeys: {
				id: "pathParams",
				q: "query",
				title: "body",
				"x-request-id": "headers",
			},
		}).search.find;

		assert.deepEqual(
			groupRequestInput(route, {
				id: "todo-1",
				q: "milk",
				title: "Buy milk",
				"x-request-id": "req-1",
			}),
			{
				pathParams: { id: "todo-1" },
				query: { q: "milk" },
				body: { title: "Buy milk" },
				headers: { "x-request-id": "req-1" },
			},
		);
	});

	it("throws or strips unknown request keys based on options", () => {
		const route = testContract({
			query: z.object({ q: z.string() }),
			requestKeys: { q: "query" },
		}).search.find;

		assert.throws(
			() => groupRequestInput(route, { q: "milk", extra: true }),
			/Unknown request key "extra"/,
		);
		assert.deepEqual(
			groupRequestInput(
				route,
				{ q: "milk", extra: true },
				{ strictRequestKeys: false },
			),
			{ query: { q: "milk" } },
		);
	});

	it("assigns the body key as a custom request body", () => {
		const route = testContract({
			path: "/uploads/:id",
			body: customBody({
				schema: z.string(),
				contentType: "text/plain",
			}),
			pathParams: z.object({ id: z.string() }),
			requestKeys: { id: "pathParams" },
		}).search.find;

		assert.deepEqual(
			groupRequestInput(route, { id: "file-1", body: "hello" }),
			{
				pathParams: { id: "file-1" },
				body: "hello",
			},
		);
	});

	it("assigns the body key as a custom request body without content type", () => {
		const route = testContract({
			body: customBody(z.instanceof(URLSearchParams)),
			requestKeys: {},
		}).search.find;
		const body = new URLSearchParams([["title", "Write docs"]]);

		assert.deepEqual(groupRequestInput(route, { body }), {
			body,
		});
	});

	it("assigns the body key as a form request body", () => {
		const route = testContract({
			body: formBody(z.object({ title: z.string() })),
			requestKeys: {},
		}).search.find;

		assert.deepEqual(
			groupRequestInput(route, { body: { title: "Write docs" } }),
			{
				body: { title: "Write docs" },
			},
		);
	});

	it("assigns the body key as a multipart request body", () => {
		const route = testContract({
			body: multipartBody({
				fields: { title: z.string() },
				arrayKeys: [],
			}),
			requestKeys: {},
		}).search.find;

		assert.deepEqual(
			groupRequestInput(route, { body: { title: "Write docs" } }),
			{
				body: { title: "Write docs" },
			},
		);
	});

	it("assigns the query key as a JSON query value", () => {
		const route = testContract({
			query: jsonQuery(
				z.object({
					page: z.number(),
					filters: z.object({ tag: z.string() }),
				}),
			),
			requestKeys: {},
		}).search.find;

		assert.deepEqual(
			groupRequestInput(route, {
				query: { page: 2, filters: { tag: "typescript" } },
			}),
			{
				query: { page: 2, filters: { tag: "typescript" } },
			},
		);
	});
});
