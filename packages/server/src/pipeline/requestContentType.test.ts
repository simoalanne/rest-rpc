import { type } from "@rest-rpc/core";
import { route } from "../builder/routeBuilder.ts";
import { toRuntimeImplementation } from "../routing/match.ts";
import { resolveRequestMediaType } from "./requestContentType.ts";

describe("resolveRequestMediaType", () => {
	const implementation = toRuntimeImplementation(
		route
			.post("/")
			.body({
				"text/plain": type<string>(),
				"application/json": type<{ name: string }>(),
			})
			.handler(() => undefined)["~restrpc"],
	);

	it("selects declared media types", () => {
		expect(resolveRequestMediaType(implementation, "text/plain")).toBe(
			"text/plain",
		);
		expect(resolveRequestMediaType(implementation, "image/png")).toMatchObject({
			status: 415,
		});
	});

	it("uses the only declared media type when the content type is missing", () => {
		const single = toRuntimeImplementation(
			route
				.post("/")
				.body(type<string>())
				.handler(() => undefined)["~restrpc"],
		);
		expect(resolveRequestMediaType(single, "")).toBe("application/json");
		expect(resolveRequestMediaType(implementation, "")).toMatchObject({
			status: 415,
		});
	});
});
