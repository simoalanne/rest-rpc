import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import { REQUEST_CONTEXT_KEY, router } from "@rest-rpc/core/contract";
import {
	router as createRouter,
	type ImplementationShape,
} from "@rest-rpc/server";
import z from "zod";
import type { StartedServer } from "../harness/listen.ts";
import { createWebAdapter } from "../harness/web.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createWebAdapter(createResponsesImplementations(), {
		createHandlerOptions: {
			errorHandlers: responseErrorHandlers,
		},
	}),
);

runResponseMiddlewareHeadersSuite(
	createWebAdapter(createResponsesImplementations(), {
		transformResponse: (response) => {
			response.headers.set("x-web-middleware", "set");
			return response;
		},
	}),
	{ "x-web-middleware": "set" },
);

const lifecycleContract = router({
	contextMutation: {
		method: "GET",
		path: "/responses/lifecycle/context-mutation",
		responses: {
			200: z.object({ ok: z.literal(true) }),
		},
	},
	returnResponse: {
		method: "GET",
		path: "/responses/lifecycle/return-response",
		responses: {
			200: z.object({ ok: z.literal(true) }),
		},
	},
});

type LifecycleContract = typeof lifecycleContract;
type WebLifecycleContext = {
	adapter: "web";
	responseHeaders: Headers;
	response: Response;
};

const createLifecycleImplementations = () => {
	const handlers: ImplementationShape<LifecycleContract, WebLifecycleContext> =
		{
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

	return createRouter(lifecycleContract, handlers);
};

describe("web response lifecycle integration", () => {
	let server: StartedServer;
	let client: ReturnType<typeof initClient<LifecycleContract>>;

	before(async () => {
		server = await createWebAdapter(createLifecycleImplementations(), {
			context: {
				adapter: "web",
				responseHeaders: new Headers(),
				response: new Response(null, {
					headers: { "x-initial-context-response": "ignored" },
				}),
			},
			createHandlerOptions: {
				errorHandlers: responseErrorHandlers,
			},
		}).start();
		client = initClient(lifecycleContract, { origin: server.origin });
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

	it("treats returned Response objects as invalid contract response bodies", async () => {
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
