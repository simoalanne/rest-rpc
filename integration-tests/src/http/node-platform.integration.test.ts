import assert from "node:assert/strict";
import { createServer, request as nodeRequest } from "node:http";
import { test } from "node:test";
import { once } from "node:events";
import { type } from "@rest-rpc/core";
import { createRouteHandler, route } from "@rest-rpc/node";
import { listen } from "./harness/listen.ts";

test("Node decodes chunked large JSON, multipart and repeated headers", async (t) => {
	const handle = createRouteHandler({
		json: route
			.post("/json")
			.body(type<{ text: string }>())
			.handler(({ text }) => ({ status: 200, body: text.length })),
		multipart: route
			.post("/multipart")
			.multipartBody({
				schema: type<{ file: Blob; tags: string[] }>(),
				arrayKeys: ["tags"],
			})
			.handler(async ({ body }) => ({
				status: 200,
				body: { bytes: body.file.size, tags: body.tags },
			})),
		cookies: route
			.get("/cookies")
			.response(200, type<string>())
			.handler(() => ({
				status: 200,
				headers: { "set-cookie": ["a=1", "b=2"] },
				body: "ok",
			})),
	});
	const server = await listen(
		createServer(async (req, res) => {
			try {
				await handle(req, res);
			} catch (error) {
				res.destroy(error as Error);
			}
		}),
	);
	t.after(() => server.close());
	const payload = JSON.stringify({ text: "x".repeat(2 * 1024 * 1024) });
	const response = await new Promise<string>((resolve, reject) => {
		const req = nodeRequest(
			`${server.origin}/json`,
			{ method: "POST", headers: { "content-type": "application/json" } },
			(res) => {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => resolve(body));
				res.on("error", reject);
			},
		);
		req.on("error", reject);
		void (async () => {
			for (let i = 0; i < payload.length; i += 8192)
				if (!req.write(payload.slice(i, i + 8192))) await once(req, "drain");
			req.end();
		})().catch(reject);
	});
	assert.equal(JSON.parse(response), 2 * 1024 * 1024);
	const form = new FormData();
	form.set("file", new Blob(["x".repeat(128 * 1024)]));
	form.append("tags", "a");
	form.append("tags", "b");
	assert.deepEqual(
		await (
			await fetch(`${server.origin}/multipart`, { method: "POST", body: form })
		).json(),
		{ bytes: 128 * 1024, tags: ["a", "b"] },
	);
	const cookies = await fetch(`${server.origin}/cookies`);
	assert.deepEqual(cookies.headers.getSetCookie(), ["a=1", "b=2"]);
	await cookies.text();
});

test(
	"Node returns from a disconnected stream with a pending next and cancels its iterator",
	{ timeout: 5000 },
	async (t) => {
		let cancelled = 0;
		let resolveClosed!: () => void;
		const closed = new Promise<void>((resolve) => {
			resolveClosed = resolve;
		});
		let signal: AbortSignal | undefined;
		const handle = createRouteHandler(
			route.get("/pending").handler(({ context }) => {
				signal = context.signal;
				let first = true;
				return {
					status: 200,
					body: {
						[Symbol.asyncIterator]() {
							return {
								next: async () => {
									if (first) {
										first = false;
										return { done: false as const, value: "first" };
									}
									return new Promise<IteratorResult<string>>(() => {});
								},
								return: async () => {
									cancelled++;
									return { done: true as const, value: undefined };
								},
							};
						},
					},
				};
			}),
		);
		const server = await listen(
			createServer(async (req, res) => {
				await handle(req, res);
				resolveClosed();
			}),
		);
		t.after(() => server.close());
		const response = await fetch(`${server.origin}/pending`);
		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel();
		await closed;
		assert.equal(signal?.aborted, true);
		assert.equal(cancelled, 1);
	},
);
