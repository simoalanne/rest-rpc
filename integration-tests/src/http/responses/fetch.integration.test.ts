import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient, route, type ApiClientFor } from "@rest-rpc/core";
import { implement } from "@rest-rpc/fetch";
import z from "zod";
import type { StartedServer } from "../harness/listen.ts";
import { createFetchAdapter } from "../harness/fetch.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createFetchAdapter(createResponsesImplementations(), {
		createHandlerOptions: {
			responseValidationErrorHandler: (_error, request) =>
				Response.json(
					{
						code: "INVALID_RESPONSE",
						path: new URL(request.url).pathname,
					},
					{
						status: 500,
						headers: { "x-error-handler": "response-validation" },
					},
				),
		},
		handleError: (error) =>
			Response.json(
				{
					code: "TEAPOT",
					message: error instanceof Error ? error.message : "unknown error",
				},
				{ status: 418 },
			),
	}),
);

runResponseMiddlewareHeadersSuite(
	createFetchAdapter(createResponsesImplementations(), {
		transformResponse: (response) => {
			response.headers.set("x-fetch-middleware", "set");
			return response;
		},
	}),
	{ "x-fetch-middleware": "set" },
);

const lifecycleContract = {
	contextMutation: route
		.get("/responses/lifecycle/context-mutation")
		.response(200, z.object({ ok: z.literal(true) })),
	returnResponse: route
		.get("/responses/lifecycle/return-response")
		.response(200, z.object({ ok: z.literal(true) })),
};

type LifecycleContract = typeof lifecycleContract;
const createLifecycleImplementations = () => {
	const implementor = implement(lifecycleContract);

	return {
		contextMutation: implementor.contextMutation.handler(({ request }) => {
			request.headers.set("x-request-mutation", "ignored");
			return {
				status: 200 as const,
				body: { ok: true as const },
			};
		}),
		returnResponse: implementor.returnResponse.handler(
			() =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}) as never,
		),
	};
};

describe("fetch response lifecycle integration", () => {
	let server: StartedServer;
	let client: ApiClientFor<LifecycleContract>;

	before(async () => {
		server = await createFetchAdapter(createLifecycleImplementations(), {
			createHandlerOptions: {
				responseValidationErrorHandler: (_error, request) =>
					Response.json(
						{
							code: "INVALID_RESPONSE",
							path: new URL(request.url).pathname,
						},
						{
							status: 500,
							headers: { "x-error-handler": "response-validation" },
						},
					),
			},
		}).start();
		client = initClient(lifecycleContract, { baseUrl: server.origin });
	});

	after(async () => {
		await server.close();
	});

	it("does not copy native request mutations onto the contract response", async () => {
		const response = await client.contextMutation();

		assert.equal(response.status, 200);
		assert.equal(response.headers.get("x-request-mutation"), null);
		assert.deepEqual(response.body, { ok: true });
	});

	it("treats returned Response objects as invalid route response bodies", async () => {
		const response = await fetch(
			`${server.origin}/responses/lifecycle/return-response`,
		);

		assert.equal(response.status, 500);
		assert.equal(
			response.headers.get("x-error-handler"),
			"response-validation",
		);
		assert.deepEqual(await response.json(), {
			code: "INVALID_RESPONSE",
			path: "/responses/lifecycle/return-response",
		});
	});
});
