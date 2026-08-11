import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { requestValidationContract } from "./contract.ts";

type RequestValidationClient = ReturnType<
	typeof initClient<typeof requestValidationContract>
>;

type RequestValidationSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

type ValidationErrorBody = {
	message: string;
	validationErrors: unknown[];
};

const assertValidationResponse = (
	response: Awaited<
		ReturnType<RequestValidationClient["params"]["fetchResponse"]>
	>,
) => {
	assert.equal(response.declared, false);
	assert.equal(response.status, 400);
	assert.equal(typeof response.body, "object");
	assert.notEqual(response.body, null);

	const body = response.body as ValidationErrorBody;
	assert.equal(
		body.message,
		"Request validation failed. Check the validationErrors field for details.",
	);
	assert.ok(Array.isArray(body.validationErrors));
	assert.ok(body.validationErrors.length > 0);
};

export const runRequestValidationSuite = (
	adapter: RequestValidationSuiteAdapter,
) => {
	describe(`${adapter.name} request validation integration`, () => {
		let server: StartedServer;
		let client: RequestValidationClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(requestValidationContract, {
				origin: server.origin,
			});
		});

		after(async () => {
			await server.close();
		});

		it("coerces string wire values when the route schemas opt in", async () => {
			const body = await client.coerce.fetch({
				id: 123,
				published: "true",
				"x-page": "2",
			});

			assert.deepEqual(body, {
				id: 123,
				published: true,
				page: 2,
			});
		});

		it("preserves empty query string values", async () => {
			assert.deepEqual(await client.emptyQuery.fetch({ value: "" }), {
				value: "",
			});
		});

		it("rejects params that do not match the route schema", async () => {
			const response = await client.params.fetchResponse({
				id: "123",
			} as never);

			assertValidationResponse(response);
		});

		it("rejects query values that do not match the route schema", async () => {
			const response = await client.query.fetchResponse({
				page: 2,
			});

			assertValidationResponse(response);
		});

		it("rejects missing required headers", async () => {
			const response = await client.headers.fetchResponse({} as never);

			assertValidationResponse(response);
		});

		it("rejects JSON bodies that do not match the route schema", async () => {
			const response = await client.body.fetchResponse({
				count: "3",
			} as never);

			assertValidationResponse(response);
		});
	});
};
