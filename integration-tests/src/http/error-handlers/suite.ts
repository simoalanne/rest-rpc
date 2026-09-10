import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { errorHandlersContract } from "./contract.ts";

type ErrorHandlersClient = ReturnType<
	typeof initClient<typeof errorHandlersContract>
>;

type ErrorHandlersSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

export const runErrorHandlersSuite = (adapter: ErrorHandlersSuiteAdapter) => {
	describe(`${adapter.name} error handlers integration`, () => {
		let server: StartedServer;
		let client: ErrorHandlersClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(errorHandlersContract, {
				baseUrl: server.origin,
			});
		});

		after(async () => {
			await server.close();
		});

		it("uses custom request validation error responses", async () => {
			const response = await fetch(
				`${server.origin}/error-handlers/validation?page=2`,
			);

			assert.equal(response.status, 422);
			assert.equal(
				response.headers.get("x-error-handler"),
				"request-validation",
			);
			assert.deepEqual(await response.json(), {
				code: "VALIDATION_ERROR",
				issueCount: 1,
				path: "/error-handlers/validation",
			});
		});

		it("uses custom unhandled error responses", async () => {
			const response = await fetch(`${server.origin}/error-handlers/unhandled`);

			assert.equal(response.status, 503);
			assert.equal(response.headers.get("x-error-handler"), "unhandled");
			assert.deepEqual(await response.json(), {
				code: "UNHANDLED_ERROR",
				message: "boom from integration handler",
				path: "/error-handlers/unhandled",
			});
		});

		it("does not pass RouteResponseError through the unhandled hook", async () => {
			const response = await client.contractResponse();

			assert.equal(response.status, 409);
			assert.equal(response.headers.get("x-error-handler"), null);
			assert.deepEqual(response.body, {
				code: "conflict",
				source: "contract-response-error",
			});
		});

		it("only invokes custom error handling for matching paths", async () => {
			const response1 = await client.hookState();
			assert.equal(response1.status, 200);
			assert.deepEqual(response1.body, {
				validationErrors: 1,
				unhandledErrors: 1,
			});
		});
	});
};
