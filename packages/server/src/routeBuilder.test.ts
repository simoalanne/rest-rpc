import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import { serverFirstRoute } from "./routeBuilder.ts";

describe("server route builder", () => {
	it("attaches handlers immutably inside the restrpc declaration", () => {
		const builder = serverFirstRoute.get("/todos");
		const handler = () => ({ status: 204 as const });
		const implementation = builder.handler(handler);

		assert.notEqual(implementation, builder);
		assert.equal(implementation["~restrpc"].method, "GET");
		assert.equal(implementation["~restrpc"].path, "/todos");
		assert.equal(implementation["~restrpc"].handler, handler);
		assert.deepEqual(implementation["~restrpc"].responses, {});
		assert.deepEqual(Object.keys(implementation), ["~restrpc"]);
		assert.equal("handler" in builder["~restrpc"], false);
		assert.equal("handler" in coreRoute, true);
	});

	it("materializes the root shorthand as a procedure", () => {
		const implementation = serverFirstRoute.handler(() => "todo-1");

		assert.equal(implementation["~restrpc"].kind, "procedure");
		assert.equal(implementation["~restrpc"].method, "POST");
		assert.equal(implementation["~restrpc"].path, "");
		assert.deepEqual(implementation["~restrpc"].responses, {});
	});
});
