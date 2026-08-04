import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { testContract } from "./factories.ts";
import { customBody } from "./route.ts";
import { validateContractSync } from "./validate.ts";

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
