import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient, route, type ApiClientFor } from "@rest-rpc/core";
import { implement, type ResponseValidationErrorHandler } from "@rest-rpc/hono";
import { setCookie } from "hono/cookie";
import z from "zod";
import { createHonoAdapter } from "../harness/hono.ts";
import type { StartedServer } from "../harness/listen.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

const responseValidationErrorHandler: ResponseValidationErrorHandler = (
	_error,
	c,
) => {
	c.header("x-error-handler", "response-validation");
	return c.json(
		{
			code: "INVALID_RESPONSE",
			path: c.req.path,
		},
		500,
	);
};

runResponsesSuite(
	createHonoAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			responseValidationErrorHandler,
		},
		configureApp: (app) => {
			app.onError((error, c) =>
				c.json(
					{
						code: "TEAPOT",
						message: error.message,
					},
					418,
				),
			);
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
		contextMutation: implementor.contextMutation.handler(({ c }) => {
			c.header("x-context-mutation", "ignored");
			setCookie(c, "context_cookie", "ignored", {
				httpOnly: true,
				path: "/",
				sameSite: "Lax",
			});

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

const getSetCookieHeaders = (headers: Headers): string[] =>
	(headers as Headers & { getSetCookie(): string[] }).getSetCookie();

describe("hono response lifecycle integration", () => {
	let server: StartedServer;
	let client: ApiClientFor<LifecycleContract>;

	before(async () => {
		server = await createHonoAdapter(createLifecycleImplementations(), {
			registerRoutesOptions: {
				responseValidationErrorHandler,
			},
		}).start();
		client = initClient(lifecycleContract, { baseUrl: server.origin });
	});

	after(async () => {
		await server.close();
	});

	it("ignores Hono context response mutations when returning a contract response", async () => {
		const response = await client.contextMutation();

		assert.equal(response.status, 200);
		assert.equal(response.headers.get("x-context-mutation"), null);
		assert.deepEqual(getSetCookieHeaders(response.headers), []);
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
