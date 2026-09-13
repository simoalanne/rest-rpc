import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient, type ApiClientFor } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { requestValidationContract } from "./contract.ts";

type RequestValidationSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

type ValidationErrorBody = {
	message: string;
	validationErrors: unknown;
};

const assertValidationResponse = async (
	response: Response,
	location: "body" | "query" | "params" | "headers",
) => {
	assert.equal(response.status, 400);
	const body = (await response.json()) as ValidationErrorBody;
	assert.equal(typeof body, "object");
	assert.notEqual(body, null);

	assert.equal(
		body.message,
		"Request validation failed. Check the validationErrors field for details.",
	);

	assert.equal(typeof body.validationErrors, "object");
	assert.notEqual(body.validationErrors, null);
	const grouped = body.validationErrors as Record<string, unknown>;
	assert.deepEqual(Object.keys(grouped), [
		"body",
		"query",
		"params",
		"headers",
	]);
	assert.ok(Array.isArray(grouped[location]));
	assert.ok(grouped[location].length > 0);
};

export const runRequestValidationSuite = (
	adapter: RequestValidationSuiteAdapter,
) => {
	describe(`${adapter.name} request validation integration`, () => {
		let server: StartedServer;
		let client: ApiClientFor<typeof requestValidationContract>;

		before(async () => {
			server = await adapter.start();
			client = initClient(requestValidationContract, {
				baseUrl: server.origin,
			});
		});

		after(async () => {
			await server.close();
		});

		it("coerces string wire values when the route schemas opt in", async () => {
			const bodyResponse = await client.coerce({
				params: { id: 123 },
				query: { published: "true" },
				headers: { "x-page": "2" },
			});
			assert.equal(bodyResponse.status, 200);
			const body = bodyResponse.body;

			assert.deepEqual(body, {
				id: 123,
				published: true,
				page: 2,
			});
		});

		it("preserves empty query string values", async () => {
			const response1 = await client.emptyQuery({
				query: {
					value: "",
				},
			});
			assert.equal(response1.status, 200);
			assert.deepEqual(response1.body, {
				value: "",
			});
		});

		it("round trips JSON query values without scalar coercion schemas", async () => {
			const bodyResponse = await client.jsonQuery({
				query: {
					page: 2,
					includeArchived: false,
					filters: { tags: ["api", "typescript"] },
				},
			});
			assert.equal(bodyResponse.status, 200);
			const body = bodyResponse.body;

			assert.deepEqual(body, {
				page: 2,
				includeArchived: false,
				tags: ["api", "typescript"],
			});
		});

		it("rejects params that do not match the route schema", async () => {
			const response = await fetch(
				`${server.origin}/request-validation/params/123`,
			);

			await assertValidationResponse(response, "params");
		});

		it("rejects query values that do not match the route schema", async () => {
			const response = await fetch(
				`${server.origin}/request-validation/query?page=2`,
			);

			await assertValidationResponse(response, "query");
		});

		it("rejects missing required headers", async () => {
			const response = await fetch(
				`${server.origin}/request-validation/headers`,
			);

			await assertValidationResponse(response, "headers");
		});

		it("rejects JSON bodies that do not match the route schema", async () => {
			const response = await fetch(`${server.origin}/request-validation/body`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ count: "3" }),
			});

			await assertValidationResponse(response, "body");
		});
	});
};
