import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invokeWithMiddleware } from "./middleware.ts";

describe("invokeWithMiddleware", () => {
	it("invokes middleware in order and passes the result back up the chain", async () => {
		const calls: string[] = [];
		const request = { requestId: "request-1" };
		const handler = (receivedRequest: unknown) => {
			calls.push("handler");
			assert.deepEqual(receivedRequest, request);
			return "response";
		};
		const middleware = [
			async (receivedRequest: unknown) => {
				calls.push("first-before");
				const result = await (
					receivedRequest as { next: () => Promise<unknown> }
				).next();
				calls.push("first-after");
				return result;
			},
			async (receivedRequest: unknown) => {
				const requestWithNext = receivedRequest as {
					requestId: string;
					next: () => Promise<unknown>;
				};
				calls.push(`second:${requestWithNext.requestId}`);
				return requestWithNext.next();
			},
		];

		const result = await invokeWithMiddleware(middleware, handler, request);

		assert.equal(result, "response");
		assert.deepEqual(calls, [
			"first-before",
			"second:request-1",
			"handler",
			"first-after",
		]);
	});

	it("calls the handler directly when there is no middleware", async () => {
		const request = { requestId: "request-1" };
		let receivedRequest: unknown;

		const result = await invokeWithMiddleware(
			[],
			(requestValue) => {
				receivedRequest = requestValue;
				return 204;
			},
			request,
		);

		assert.equal(result, 204);
		assert.equal(receivedRequest, request);
	});

	it("returns a middleware result without calling downstream handlers", async () => {
		let handlerCalled = false;

		const result = await invokeWithMiddleware(
			[
				() => {
					return "short-circuit";
				},
			],
			() => {
				handlerCalled = true;
				return "handler";
			},
			{},
		);

		assert.equal(result, "short-circuit");
		assert.equal(handlerCalled, false);
	});

	it("rejects when middleware calls next more than once", async () => {
		let downstreamCalls = 0;

		await assert.rejects(
			invokeWithMiddleware(
				[
					async (receivedRequest: unknown) => {
						const { next } = receivedRequest as {
							next: () => Promise<unknown>;
						};
						await next();
						return next();
					},
				],
				() => {
					downstreamCalls += 1;
					return "response";
				},
				{},
			),
			{
				name: "TypeError",
				message: "Middleware next() may only be called once.",
			},
		);

		assert.equal(downstreamCalls, 1);
	});
});
