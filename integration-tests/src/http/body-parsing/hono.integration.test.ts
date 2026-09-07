import assert from "node:assert/strict";
import type { Server } from "node:http";
import { describe, it } from "node:test";
import { createAdaptorServer } from "@hono/node-server";
import { registerRoutes } from "@rest-rpc/hono";
import { Hono } from "hono";
import { listen } from "../harness/listen.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

runBodyParsingSuite({
	name: "hono",
	start: async () => {
		const app = new Hono();

		registerRoutes(app, createBodyParsingImplementations());

		const server = createAdaptorServer({
			fetch: app.fetch,
		}) as Server;

		return listen(server);
	},
});

describe("hono default body parser errors", () => {
	it("returns a parsing 400 when the default JSON parser fails", async () => {
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
			message: "Invalid request body",
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
			bodyParser: () => {
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
