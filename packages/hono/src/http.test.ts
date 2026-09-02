import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route, type as schemaType } from "@rest-rpc/core";
import { Hono } from "hono";
import { registerRoutes, router } from "./index.ts";

describe("registerRoutes", () => {
	it("parses urlencoded form bodies with the default body parser", async () => {
		const contract = {
			form: route
				.post("/forms")
				.formBody(schemaType<{ title: string }>())
				.response(200, schemaType<{ title: string }>()),
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

	it("parses multipart bodies with the default body parser", async () => {
		const contract = {
			upload: route
				.post("/uploads")
				.multipartBody({
					schema: schemaType<{
						title: string;
						file: Blob;
						tags: string[];
					}>(),
					arrayKeys: ["tags"],
				})
				.response(
					200,
					schemaType<{
						title: string;
						tags: string[];
						hasFile: boolean;
					}>(),
				),
		} as const;
		const app = new Hono();

		registerRoutes(
			app,
			router(contract, {
				upload: ({ body }) => ({
					title: body.title,
					tags: body.tags,
					hasFile: body.file instanceof Blob,
				}),
			}),
		);

		const body = new FormData();
		body.set("title", "Write docs");
		body.set("file", new Blob(["hello"], { type: "text/plain" }));
		body.append("tags", "ts");
		body.append("tags", "rpc");

		const response = await app.fetch(
			new Request("https://example.com/uploads", {
				method: "POST",
				body,
			}),
		);

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			title: "Write docs",
			tags: ["ts", "rpc"],
			hasFile: true,
		});
	});
});
