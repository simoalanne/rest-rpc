import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import { REQUEST_CONTEXT_KEY, router } from "@rest-rpc/core/contract";
import {
	router as createRouter,
	type ImplementationShape,
} from "@rest-rpc/server";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import z from "zod";
import { createHonoAdapter } from "../harness/hono.ts";
import type { StartedServer } from "../harness/listen.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createHonoAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			errorHandlers: responseErrorHandlers,
		},
	}),
);

runResponseMiddlewareHeadersSuite(
	createHonoAdapter(createResponsesImplementations(), {
		configureApp: (app) => {
			app.use("*", async (c, next) => {
				await next();
				c.header("x-hono-middleware", "set");
			});
		},
	}),
	{ "x-hono-middleware": "set" },
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
type HonoContext = { c: Context };

const createLifecycleImplementations = () => {
	const handlers: ImplementationShape<LifecycleContract, HonoContext> = {
		contextMutation: (request) => {
			const { c } = request[REQUEST_CONTEXT_KEY];
			c.header("x-context-mutation", "ignored");
			setCookie(c, "context_cookie", "ignored", {
				httpOnly: true,
				path: "/",
				sameSite: "Lax",
			});

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

const getSetCookieHeaders = (headers: Headers): string[] =>
	(headers as Headers & { getSetCookie(): string[] }).getSetCookie();

describe("hono response lifecycle integration", () => {
	let server: StartedServer;
	let client: ReturnType<typeof initClient<LifecycleContract>>;

	before(async () => {
		server = await createHonoAdapter(createLifecycleImplementations(), {
			registerRoutesOptions: {
				errorHandlers: responseErrorHandlers,
			},
		}).start();
		client = initClient(lifecycleContract, { baseUrl: server.origin });
	});

	after(async () => {
		await server.close();
	});

	it("ignores Hono context response mutations when returning a contract response", async () => {
		const response = await client.contextMutation.fetchResponse();

		assert.equal(response.declared, true);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("x-contract-result"), "returned");
		assert.equal(response.headers.get("x-context-mutation"), null);
		assert.deepEqual(getSetCookieHeaders(response.headers), []);
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
