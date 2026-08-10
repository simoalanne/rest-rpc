import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { testContract } from "../../test/factories/contract.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { customBody } from "./route.ts";
import {
	groupRequestInput,
	validateContractAsync,
	validateContractSync,
	validateFlatRequestInput,
} from "./validate.ts";

const transformSchema = <TOutput>(
	transform: (value: unknown) => TOutput,
): StandardSchemaV1<unknown, TOutput> => ({
	"~standard": {
		version: 1,
		vendor: "test",
		validate: (value) => ({ value: transform(value) }),
	},
});

const issueSchema = (message: string): StandardSchemaV1 => ({
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message }] }),
	},
});

const recordValue = (value: unknown, key: string) =>
	(value as Record<string, unknown>)[key];

describe("validateContractSync", () => {
	it("populates request keys from request schemas", () => {
		const contract = validateContractSync(
			testContract({
				path: "/search/:id",
				request: {
					params: z.object({ id: z.string() }),
					query: z.object({ q: z.string().optional() }),
					body: z.object({ title: z.string() }),
				},
			}),
		);

		assert.deepEqual(contract.search.find.request.requestKeys, {
			id: "params",
			q: "query",
			title: "body",
		});
	});

	it("populates request keys from schema record request declarations", () => {
		const contract = validateContractSync(
			testContract({
				path: "/search/:id",
				request: {
					params: {
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
				},
			}),
		);

		assert.deepEqual(contract.search.find.request.requestKeys, {
			id: "params",
			q: "query",
			title: "body",
			"x-request-id": "headers",
		});
	});

	it("populates async request keys from schema record request declarations", async () => {
		const contract = await validateContractAsync(
			testContract({
				path: "/search/:id",
				request: {
					params: {
						id: z.string(),
					},
					query: {
						q: z.string().optional(),
					},
				},
			}),
		);

		assert.deepEqual(contract.search.find.request.requestKeys, {
			id: "params",
			q: "query",
		});
	});

	it("preserves existing request keys", () => {
		const contract = validateContractSync(
			testContract({
				path: "/search/:id",
				request: {
					params: z.object({ id: z.string() }),
					requestKeys: {
						id: "params",
					},
				},
			}),
		);

		assert.deepEqual(contract.search.find.request.requestKeys, {
			id: "params",
		});
	});

	it("resolves unsupported schema request keys from a custom resolver", () => {
		const schema = z.string();
		const contract = validateContractSync(
			testContract({
				request: {
					query: schema,
				},
			}),
			{
				resolveRequestKeys: (candidate) =>
					candidate === schema ? ["q"] : undefined,
			},
		);

		assert.deepEqual(contract.search.find.request.requestKeys, {
			q: "query",
		});
	});

	it("rejects duplicate flattened request keys", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						path: "/search/:id",
						request: {
							params: z.object({ id: z.string() }),
							query: z.object({ id: z.string() }),
						},
					}),
				),
			/duplicate request keys/,
		);
	});

	it("rejects reserved context request keys", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						request: {
							query: z.object({ context: z.string() }),
						},
					}),
				),
			/reserved request key "context"/,
		);
	});

	it("rejects reserved content-type header keys", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						request: {
							headers: {
								"Content-Type": z.string(),
							},
						},
					}),
				),
			/reserved header key "Content-Type"/,
		);
	});

	it("rejects header keys that differ only by case", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						request: {
							headers: {
								"x-request-id": z.string(),
								"X-Request-ID": z.string(),
							},
						},
					}),
				),
			/duplicate header keys that differ only by case/,
		);
	});

	it("rejects reserved content-type header request keys", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						request: {
							requestKeys: {
								"content-type": "headers",
							},
						},
					}),
				),
			/reserved header key "content-type"/,
		);
	});

	it("rejects header request keys that differ only by case", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						request: {
							requestKeys: {
								"x-request-id": "headers",
								"X-Request-ID": "headers",
							},
						},
					}),
				),
			/duplicate header keys that differ only by case/,
		);
	});

	it("rejects body keys in query or params for custom request bodies", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						path: "/uploads/:body",
						request: {
							params: z.object({ body: z.string() }),
							body: customBody({
								schema: z.instanceof(Uint8Array),
								contentType: "application/octet-stream",
							}),
						},
					}),
				),
			/has a "body" key in query or params/,
		);
	});

	it("allows body keys in query or params without custom request bodies", () => {
		const contract = validateContractSync(
			testContract({
				path: "/search/:body",
				request: {
					params: z.object({ body: z.string() }),
				},
			}),
		);

		assert.deepEqual(contract.search.find.request.requestKeys, {
			body: "params",
		});
	});

	it("rejects path params without params request keys", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						path: "/search/:id",
						request: {
							query: z.object({ q: z.string() }),
						},
					}),
				),
			/without a matching params schema key/,
		);
	});

	it("rejects path params when no request is declared", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						path: "/search/:id",
					}),
				),
			/without a matching params schema key/,
		);
	});

	it("rejects params request keys without matching path params", () => {
		assert.throws(
			() =>
				validateContractSync(
					testContract({
						path: "/search",
						request: {
							params: z.object({ id: z.string() }),
						},
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
			request: {
				body: z.object({ title: z.string() }),
				query: z.object({ q: z.string() }),
				params: z.object({ id: z.string() }),
				headers: { "x-request-id": z.string() },
				requestKeys: {
					id: "params",
					q: "query",
					title: "body",
					"x-request-id": "headers",
				},
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
				params: { id: "todo-1" },
				query: { q: "milk" },
				body: { title: "Buy milk" },
				headers: { "x-request-id": "req-1" },
			},
		);
	});

	it("throws or strips unknown request keys based on options", () => {
		const route = testContract({
			request: {
				query: z.object({ q: z.string() }),
				requestKeys: { q: "query" },
			},
		}).search.find;

		assert.throws(
			() => groupRequestInput(route, { q: "milk", extra: true }),
			/Unknown request key "extra"/,
		);
		assert.deepEqual(
			groupRequestInput(
				route,
				{ q: "milk", extra: true },
				{ unknownRequestKeys: "strip" },
			),
			{ query: { q: "milk" } },
		);
	});

	it("assigns the body key as a custom request body", () => {
		const route = testContract({
			path: "/uploads/:id",
			request: {
				body: customBody({
					schema: z.string(),
					contentType: "text/plain",
				}),
				params: z.object({ id: z.string() }),
				requestKeys: { id: "params" },
			},
		}).search.find;

		assert.deepEqual(
			groupRequestInput(route, { id: "file-1", body: "hello" }),
			{
				params: { id: "file-1" },
				body: "hello",
			},
		);
	});
});

describe("validateFlatRequestInput", () => {
	it("validates whole segment schemas and returns parsed flat data", () => {
		const route = testContract({
			path: "/search/:id",
			request: {
				params: transformSchema((value) => ({
					id: `params:${recordValue(value, "id")}`,
				})),
				query: transformSchema((value) => ({
					q: `query:${recordValue(value, "q")}`,
				})),
				body: transformSchema((value) => ({
					title: `body:${recordValue(value, "title")}`,
				})),
				requestKeys: {
					id: "params",
					q: "query",
					title: "body",
				},
			},
		}).search.find;

		assert.deepEqual(
			validateFlatRequestInput(route, {
				id: "123",
				q: " milk ",
				title: " Buy milk ",
				extra: "ignored",
			}),
			{
				success: true,
				data: {
					id: "params:123",
					q: "query: milk ",
					title: "body: Buy milk ",
				},
			},
		);
	});

	it("validates schema record segments and headers by field", () => {
		const route = testContract({
			path: "/todos/:id",
			request: {
				params: {
					id: transformSchema((value) => `params:${value}`),
				},
				query: {
					page: transformSchema((value) => `query:${value}`),
				},
				body: {
					title: transformSchema((value) => `body:${value}`),
				},
				headers: {
					"x-request-id": transformSchema((value) => `header:${value}`),
				},
				requestKeys: {
					id: "params",
					page: "query",
					title: "body",
					"x-request-id": "headers",
				},
			},
		}).search.find;

		assert.deepEqual(
			validateFlatRequestInput(route, {
				id: "123",
				page: "2",
				title: " Buy milk ",
				"x-request-id": " req-1 ",
			}),
			{
				success: true,
				data: {
					id: "params:123",
					page: "query:2",
					title: "body: Buy milk ",
					"x-request-id": "header: req-1 ",
				},
			},
		);
	});

	it("validates custom request bodies and returns the parsed body key", () => {
		const route = testContract({
			request: {
				body: customBody({
					schema: transformSchema((value) => `body:${value}`),
					contentType: "text/plain",
				}),
				requestKeys: {},
			},
		}).search.find;

		assert.deepEqual(validateFlatRequestInput(route, { body: " hello " }), {
			success: true,
			data: { body: "body: hello " },
		});
	});

	it("returns accumulated validation errors", () => {
		const route = testContract({
			path: "/todos/:id",
			request: {
				params: {
					id: issueSchema("invalid id"),
				},
				headers: {
					"x-request-id": issueSchema("missing request id"),
				},
				requestKeys: {
					id: "params",
					"x-request-id": "headers",
				},
			},
		}).search.find;

		const result = validateFlatRequestInput(route, {
			id: "not-a-number",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.deepEqual(
				result.errors.map((error) => error.message),
				["invalid id", "missing request id"],
			);
		}
	});
});
