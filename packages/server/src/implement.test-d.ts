import { route, type } from "@rest-rpc/core";
import { implement } from "./implement.ts";

const contract = {
	users: {
		get: route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(200, type<{ name: string }>()),
	},
};

describe("implement types", () => {
	it("should infer route inputs, context, and implementation shape", () => {
		const implementation = implement(contract).$context<{
			requestId: string;
		}>();

		implementation.users.get.handler((request) => {
			expectTypeOf(request.params).toEqualTypeOf<{ id: string }>();
			expectTypeOf(request.context.get("requestId")).toEqualTypeOf<string>();

			return { status: 200, body: { name: "Ada" } };
		});
	});
});
