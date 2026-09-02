import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "@rest-rpc/core";
import z from "zod";
import { flattenRequestData } from "./requestData.ts";

describe("flattenRequestData", () => {
	it("rejects non-object ordinary outputs only when flattening", () => {
		const routeDeclaration = route.get("/items").query(z.any()).response(204);
		for (const value of [["value"], "value", null] as const) {
			assert.throws(
				() => flattenRequestData(routeDeclaration, { query: value }),
				/Cannot flatten query output for GET \/items: expected a non-null object, received (an array|string|object)\./,
			);
		}
	});
});
