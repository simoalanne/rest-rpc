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
			.handler(({ body: { text } }) => ({ status: 200, body: text.length })),
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
});
