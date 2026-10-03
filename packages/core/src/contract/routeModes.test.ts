import { type } from "../standard-schema/type.ts";
import { resolveRoutePath } from "./path.ts";
import { route } from "./routeBuilder.ts";
import { usesFlatInput, usesPlainOutput } from "./routeModes.ts";

const schema = type<{ name: string }>();

describe("route modes", () => {
	it("uses flat input only when the route declares input", () => {
		expect(usesFlatInput(route.input(schema)["~restrpc"])).toBe(true);
		expect(usesFlatInput(route.headers(schema).input(schema)["~restrpc"])).toBe(
			true,
		);
		expect(usesFlatInput(route.body(schema)["~restrpc"])).toBe(false);
		expect(usesFlatInput(route.output(schema)["~restrpc"])).toBe(false);
	});

	it("uses plain output only when the route declares output", () => {
		expect(usesPlainOutput(route.output(schema)["~restrpc"])).toBe(true);
		expect(usesPlainOutput(route.response(200, schema)["~restrpc"])).toBe(
			false,
		);
		expect(usesPlainOutput(route.get("/users").response(200)["~restrpc"])).toBe(
			false,
		);
	});

	it("derives the route path from tree keys when none is declared", () => {
		expect(resolveRoutePath({ path: undefined }, ["users", "list"])).toBe(
			"/users/list",
		);
		expect(resolveRoutePath({ path: "/people" }, ["users", "list"])).toBe(
			"/people",
		);
	});
});
