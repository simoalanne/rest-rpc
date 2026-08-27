import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { isCustomBody, isFormBody, isNoBody } from "@rest-rpc/core/contract";
import { createRouteHandler, type FetchRouteParseBody } from "@rest-rpc/fetch";
import { listen } from "../harness/listen.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

const parseBody: FetchRouteParseBody = async ({ body, request }) => {
	if (!body || isNoBody(body)) return undefined;
	const contentType = request.headers.get("content-type") ?? "";
	if (isFormBody(body)) {
		return contentType.startsWith("application/x-www-form-urlencoded")
			? new URLSearchParams(await request.text())
			: undefined;
	}
	if (!isCustomBody(body)) {
		return contentType.startsWith("application/json")
			? request.json()
			: undefined;
	}
	if (body.contentType === undefined) {
		return contentType.startsWith("application/x-www-form-urlencoded")
			? new URLSearchParams(await request.text())
			: undefined;
	}
	const declaredContentType = (
		Array.isArray(body.contentType) ? body.contentType : [body.contentType]
	).find((value) => contentType.startsWith(value.split(";")[0] ?? ""));
	if (!declaredContentType) return undefined;
	if (declaredContentType === "application/octet-stream") {
		return new Uint8Array(await request.arrayBuffer());
	}
	if (declaredContentType.startsWith("application/json")) return request.json();
	return request.text();
};

runBodyParsingSuite({
	name: "fetch",
	start: async () => {
		const handler = createRouteHandler(createBodyParsingImplementations(), {
			parseBody,
		});

		return listen(
			createServer(async (req, res) => {
				const request = new Request(`http://127.0.0.1${req.url}`, {
					method: req.method,
					headers: req.headers as HeadersInit,
					body: withoutBody(req.method) ? undefined : Readable.toWeb(req),
					duplex: "half",
				} as RequestInit & { duplex: "half" });
				const response = await handler(request, {});

				res.writeHead(response.status, Object.fromEntries(response.headers));
				if (response.body) {
					for await (const chunk of response.body) res.write(chunk);
				}
				res.end();
			}),
		);
	},
});

describe("fetch default body parser errors", () => {
	it("returns a validation-style 400 when the default JSON parser fails", async () => {
		const handler = createRouteHandler(createBodyParsingImplementations());
		const response = await handler(
			new Request("http://127.0.0.1/body-parsing/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
			{},
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
		const handler = createRouteHandler(createBodyParsingImplementations(), {
			parseBody: () => {
				throw new Error("custom parser failed");
			},
		});

		await assert.rejects(
			() =>
				handler(
					new Request("http://127.0.0.1/body-parsing/json", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
					}),
					{},
				),
			/custom parser failed/,
		);
	});
});
