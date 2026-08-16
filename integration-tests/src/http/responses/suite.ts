import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import { responsesContract } from "./contract.ts";

type ResponsesClient = ReturnType<typeof initClient<typeof responsesContract>>;

type ResponsesSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

const getSetCookieHeaders = (headers: Headers): string[] =>
	(headers as Headers & { getSetCookie(): string[] }).getSetCookie();

const toCookieHeader = (setCookieHeaders: string[]) =>
	setCookieHeaders.map((value) => value.split(";")[0]).join("; ");

export const runResponsesSuite = (adapter: ResponsesSuiteAdapter) => {
	describe(`${adapter.name} responses integration`, () => {
		let server: StartedServer;
		let client: ResponsesClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(responsesContract, { origin: server.origin });
		});

		after(async () => {
			await server.close();
		});

		it("preserves explicit JSON content-type headers", async () => {
			const response = await client.jsonContentType.fetchResponse();

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			assert.match(
				response.headers.get("content-type") ?? "",
				/^application\/vnd\.rest-rpc\+json(?:;|$)/,
			);
			assert.deepEqual(response.body, { ok: true });
		});

		it("skips undefined headers and serializes multiple header values", async () => {
			const response = await client.headers.fetchResponse();

			assert.equal(response.declared, true);
			assert.equal(response.status, 200);
			assert.equal(response.headers.get("x-defined"), "defined");
			assert.equal(response.headers.get("x-skipped"), null);
			assert.equal(response.headers.get("x-multi"), "first, second");
			assert.deepEqual(response.body, { ok: true });
		});

		it("preserves set-cookie array headers as usable cookie values", async () => {
			const issueResponse = await client.cookies.issue.fetchResponse();
			const setCookieHeaders = getSetCookieHeaders(issueResponse.headers);

			assert.equal(issueResponse.declared, true);
			assert.equal(issueResponse.status, 200);
			assert.deepEqual(setCookieHeaders, [
				"rest_rpc_session=session-1; Path=/; HttpOnly; SameSite=Lax",
				"rest_rpc_theme=dark; Path=/; SameSite=Lax",
			]);

			const readResponse = await client.cookies.read.fetchResponse({
				cookie: toCookieHeader(setCookieHeaders),
			});

			assert.equal(readResponse.declared, true);
			assert.equal(readResponse.status, 200);
			assert.deepEqual(readResponse.body, {
				cookie: "rest_rpc_session=session-1; rest_rpc_theme=dark",
			});
		});

		it("returns undeclared runtime response status and body", async () => {
			const response = await client.undeclared.fetchResponse();

			assert.equal(response.declared, false);
			assert.equal(response.status, 418);
			assert.deepEqual(response.body, {
				code: "TEAPOT",
				message: "undeclared response",
			});
		});

		it("routes declared response validation failures through unhandled error hooks", async () => {
			const response = await client.invalidDeclared.fetchResponse();

			assert.equal(response.declared, false);
			assert.equal(response.status, 500);
			assert.equal(
				response.headers.get("x-error-handler"),
				"response-validation",
			);
			assert.deepEqual(response.body, {
				code: "INVALID_RESPONSE",
				path: "/responses/invalid-declared",
			});
		});
	});
};
