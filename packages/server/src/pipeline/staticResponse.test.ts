import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { route } from "../builder/routeBuilder.ts";
import { createRouteHandlers } from "./createRouteHandlers.ts";

const schema = (
	validate: StandardSchemaV1["~standard"]["validate"],
): StandardSchemaV1 => ({
	"~standard": { version: 1, vendor: "test", validate },
});

describe("static routes", () => {
	it("throws invalid and async responses when the routes are compiled", () => {
		const invalid = route
			.get("/invalid")
			.response(schema(() => ({ issues: [{ message: "invalid" }] })))
			.static({ id: 1 });
		expect(() => createRouteHandlers({ invalid })).toThrow();
		const async = route
			.get("/async")
			.response(schema(async (value) => ({ value })))
			.static({ id: 1 });
		expect(() => createRouteHandlers({ async })).toThrow();
	});
});
