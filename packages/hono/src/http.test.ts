import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formBody, type as schemaType } from "@rest-rpc/core/contract";
import { Hono } from "hono";
import { registerRoutes, router } from "./index.ts";

describe("registerRoutes", () => {
	it("parses urlencoded form bodies with the default body parser", async () => {
		const contract = {
			form: {
				method: "POST",
				path: "/forms",
				body: formBody(schemaType<{ title: string }>()),
				responses: {
					200: schemaType<{ title: string }>(),
				},
			},
		} as const;
		const app = new Hono();

		registerRoutes(
			app,
			router(contract, {
				form: ({ body }) => body,
			}),
		);

		const response = await app.fetch(
			new Request("https://example.com/forms", {
				method: "POST",
				body: new URLSearchParams({ title: "Write docs" }),
			}),
		);

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			title: "Write docs",
		});
	});
});
