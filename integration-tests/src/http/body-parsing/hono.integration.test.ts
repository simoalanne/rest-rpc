import assert from "node:assert/strict";
import type { Server } from "node:http";
import { describe, it } from "node:test";
import { createAdaptorServer } from "@hono/node-server";
import { isCustomBody } from "@rest-rpc/core/contract";
import { type HonoParseBody, registerRoutes } from "@rest-rpc/hono";
import { Hono } from "hono";
import { listen } from "../harness/listen.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

const parseBody: HonoParseBody = async ({ body, c }) => {
	const contentType = c.req.header("content-type") ?? "";
	if (!isCustomBody(body)) {
		return contentType.startsWith("application/json")
			? c.req.json()
			: undefined;
	}
	if (body.contentType === undefined) {
		return contentType.startsWith("application/x-www-form-urlencoded")
			? new URLSearchParams(await c.req.text())
			: undefined;
	}
	const declaredContentType = (
		Array.isArray(body.contentType) ? body.contentType : [body.contentType]
	).find((value) => contentType.startsWith(value.split(";")[0] ?? ""));
	if (!declaredContentType) return undefined;
	if (declaredContentType === "application/octet-stream") {
		return new Uint8Array(await c.req.arrayBuffer());
	}
	if (declaredContentType.startsWith("application/json")) return c.req.json();
	return c.req.text();
};

runBodyParsingSuite({
	name: "hono",
	start: async () => {
		const app = new Hono();

		registerRoutes(app, createBodyParsingImplementations(), { parseBody });

		const server = createAdaptorServer({
			fetch: app.fetch,
		}) as Server;

		return listen(server);
	},
});

describe("hono default body parser errors", () => {
	it("returns a validation-style 400 when the default JSON parser fails", async () => {
		const app = new Hono();
		registerRoutes(app, createBodyParsingImplementations());

		const response = await app.fetch(
			new Request("http://127.0.0.1/body-parsing/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
		);

		assert.equal(response.status, 400);
		assert.match(
			response.headers.get("content-type") ?? "",
			/^application\/json/,
		);
		assert.deepEqual(await response.json(), {
			message:
				"Request validation failed. Check the validationErrors field for details.",
			validationErrors: [{ message: "Request could not be parsed." }],
		});
	});

	it("lets custom body parser errors propagate", async () => {
		const app = new Hono();
		let capturedError: unknown;
		app.onError((error) => {
			capturedError = error;
			return new Response("custom error handler", { status: 599 });
		});
		registerRoutes(app, createBodyParsingImplementations(), {
			parseBody: () => {
				throw new Error("custom parser failed");
			},
		});

		const response = await app.fetch(
			new Request("http://127.0.0.1/body-parsing/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
		);

		assert.equal(response.status, 599);
		assert.equal(await response.text(), "custom error handler");
		assert.equal((capturedError as Error).message, "custom parser failed");
	});
});
