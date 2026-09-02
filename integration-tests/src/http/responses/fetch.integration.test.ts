import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient, route } from "@rest-rpc/core";
import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import type { ImplementationShape } from "@rest-rpc/server";
import { router as createFetchRouter } from "@rest-rpc/fetch";
import z from "zod";
import type { StartedServer } from "../harness/listen.ts";
import { createFetchAdapter } from "../harness/fetch.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createFetchAdapter(createResponsesImplementations(), {
		createHandlerOptions: {
			errorHandlers: responseErrorHandlers,
		},
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
type FetchLifecycleContext = {
	adapter: "fetch";
	responseHeaders: Headers;
	response: Response;
};

const createLifecycleImplementations = () => {
	const handlers: ImplementationShape<
		LifecycleContract,
		FetchLifecycleContext
	> = {
		contextMutation: (request) => {
			const context = request[REQUEST_CONTEXT_KEY];
			context.responseHeaders.set("x-context-mutation", "ignored");
			context.response.headers.set("x-context-response-mutation", "ignored");

			return {
				status: 200 as const,
				headers: {
					"x-contract-result": "returned",
				},
				body: { ok: true as const },
			};
		},
		returnResponse: () =>
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}) as never,
	};

	return createFetchRouter(lifecycleContract)
		.middleware(() => ({
			adapter: "fetch" as const,
			responseHeaders: new Headers(),
			response: new Response(null, {
				headers: { "x-initial-context-response": "ignored" },
			}),
		}))
		.handlers(handlers);
};

describe("fetch response lifecycle integration", () => {
	let server: StartedServer;
	let client: ReturnType<typeof initClient<LifecycleContract>>;

	before(async () => {
		server = await createFetchAdapter(createLifecycleImplementations(), {
			createHandlerOptions: {
				errorHandlers: responseErrorHandlers,
			},
		}).start();
		client = initClient(lifecycleContract, { baseUrl: server.origin });
	});

	after(async () => {
		await server.close();
	});

	it("ignores user-provided context response mutations when returning a contract response", async () => {
		const response = await client.contextMutation.fetchResponse();

		assert.equal(response.declared, true);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("x-contract-result"), "returned");
		assert.equal(response.headers.get("x-context-mutation"), null);
		assert.equal(response.headers.get("x-context-response-mutation"), null);
		assert.equal(response.headers.get("x-initial-context-response"), null);
		assert.deepEqual(response.body, { ok: true });
	});

	it("treats returned Response objects as invalid route response bodies", async () => {
		const response = await client.returnResponse.fetchResponse();

		assert.equal(response.declared, false);
		assert.equal(response.status, 500);
		assert.equal(
			response.headers.get("x-error-handler"),
			"response-validation",
		);
		assert.deepEqual(response.body, {
			code: "INVALID_RESPONSE",
			path: "/responses/lifecycle/return-response",
		});
	});
});
