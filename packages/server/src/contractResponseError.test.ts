import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noBody } from "@rest-rpc/core/contract";
import { ContractResponseError } from "./contractResponseError.ts";

const route = {
	method: "GET",
	path: "/todos/:id",
	responses: {
		404: noBody(),
	},
} as const;

describe("ContractResponseError", () => {
	it("stores the route and response envelope fields", () => {
		const response = { status: 404, body: undefined };
		const error = new ContractResponseError(route, response);

		assert.equal(error.message, "Contract response error");
		assert.equal(error.route, route);
		assert.equal(error.response, response);
		assert.equal(error.status, 404);
		assert.equal(error.body, undefined);
	});
});
