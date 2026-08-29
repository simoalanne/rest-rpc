import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	formBody,
	multipartBody,
	noBody,
	type as schemaType,
} from "@rest-rpc/core/contract";
import { createRouteHandler, route, router } from "./index.ts";

const healthRoute = {
	method: "GET",
	path: "/health",
	responses: {
		204: noBody(),
	},
} as const;

const compiledRoute = {
	method: "GET",
	path: "/compiled",
	responses: {
		204: noBody(),
	},
} as const;

const plainRoute = {
	method: "GET",
	path: "/plain",
	responses: {
		204: noBody(),
	},
} as const;

describe("createRouteHandler", () => {
	it("runs stacked middleware in declaration order with accumulated context", async () => {
		const calls: string[] = [];
		const routes = router({
			health: healthRoute,
		})
			.middleware(() => {
				calls.push("first");
				return {
					userId: "user-1",
				};
			})
			.middleware(({ context }) => {
				calls.push("second");
				assert.equal(context.userId, "user-1");
				return {
					db: "todos",
				};
			})
			.handlers({
				health: ({ context }) => {
					calls.push("handler");
					assert.equal(context.userId, "user-1");
					assert.equal(context.db, "todos");
					assert.equal(context.request.url, "https://example.com/health");
					return undefined;
				},
			});

		const handle = createRouteHandler(routes);
		const response = await handle(
			new Request("https://example.com/health"),
			{},
		);

		assert.equal(response.status, 204);
		assert.deepEqual(calls, ["first", "second", "handler"]);
	});

	it("short-circuits the middleware stack when middleware returns a response", async () => {
		const calls: string[] = [];
		const routes = router({
			health: healthRoute,
		})
			.middleware(() => {
				calls.push("first");
				return new Response(null, { status: 401 });
			})
			.middleware(() => {
				calls.push("second");
				return {};
			})
			.handlers({
				health: () => {
					calls.push("handler");
					return undefined;
				},
			});

		const handle = createRouteHandler(routes);
		const response = await handle(
			new Request("https://example.com/health"),
			{},
		);

		assert.equal(response.status, 401);
		assert.deepEqual(calls, ["first"]);
	});

	it("does not override middleware on compiled routes inside another router", async () => {
		const calls: string[] = [];
		const compiled = route(compiledRoute)
			.middleware(() => {
				calls.push("compiled middleware");
				return {
					compiled: true,
				};
			})
			.handler(({ context }) => {
				calls.push("compiled handler");
				assert.equal(context.compiled, true);
				return undefined;
			});

		const routes = router({
			compiled: compiledRoute,
			plain: plainRoute,
		})
			.middleware(() => {
				calls.push("parent middleware");
				return {
					parent: true,
				};
			})
			.handlers({
				compiled,
				plain: ({ context }) => {
					calls.push("plain handler");
					assert.equal(context.parent, true);
					return undefined;
				},
			});

		const handle = createRouteHandler(routes);

		const compiledResponse = await handle(
			new Request("https://example.com/compiled"),
			{},
		);
		assert.equal(compiledResponse.status, 204);
		assert.deepEqual(calls, ["compiled middleware", "compiled handler"]);

		calls.length = 0;
		const plainResponse = await handle(
			new Request("https://example.com/plain"),
			{},
		);
		assert.equal(plainResponse.status, 204);
		assert.deepEqual(calls, ["parent middleware", "plain handler"]);
	});

	it("parses urlencoded form bodies with the default body parser", async () => {
		const routes = router({
			form: {
				method: "POST",
				path: "/forms",
				body: formBody(schemaType<{ title: string }>()),
				responses: {
					200: schemaType<{ title: string }>(),
				},
			},
		}).handlers({
			form: ({ body }) => body,
		});
		const handle = createRouteHandler(routes);

		const response = await handle(
			new Request("https://example.com/forms", {
				method: "POST",
				body: new URLSearchParams({ title: "Write docs" }),
			}),
			{},
		);

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			title: "Write docs",
		});
	});

	it("parses multipart bodies with the default body parser", async () => {
		const routes = router({
			upload: {
				method: "POST",
				path: "/uploads",
				body: multipartBody({
					schema: schemaType<{
						title: string;
						file: Blob;
						tags: string[];
					}>(),
					arrayKeys: ["tags"],
				}),
				responses: {
					200: schemaType<{
						title: string;
						tags: string[];
						hasFile: boolean;
					}>(),
				},
			},
		}).handlers({
			upload: ({ body }) => ({
				title: body.title,
				tags: body.tags,
				hasFile: body.file instanceof Blob,
			}),
		});
		const handle = createRouteHandler(routes);
		const body = new FormData();
		body.set("title", "Write docs");
		body.set("file", new Blob(["hello"], { type: "text/plain" }));
		body.append("tags", "ts");
		body.append("tags", "rpc");

		const response = await handle(
			new Request("https://example.com/uploads", {
				method: "POST",
				body,
			}),
			{},
		);

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			title: "Write docs",
			tags: ["ts", "rpc"],
			hasFile: true,
		});
	});
});
