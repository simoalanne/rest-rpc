import { route, type } from "@rest-rpc/core";
import { assertRequestContentType } from "./requestContentType.ts";

describe("requestContentType", () => {
	it("accepts normalized declared types and missing headers", () => {
		const declaration = route.post("/").body(type<string>(), {
			contentType: ["text/plain", "application/json"],
		})["~restrpc"];
		expect(
			assertRequestContentType(declaration, "Text/Plain; charset=utf-8"),
		).toBeUndefined();
		expect(assertRequestContentType(declaration, null)).toBeUndefined();
		expect(assertRequestContentType(declaration, "image/png")).toMatchObject({
			status: 415,
		});
	});

	it("rejects received content types when no request body is declared", () => {
		expect(
			assertRequestContentType(route.get("/")["~restrpc"], "application/json"),
		).toMatchObject({ status: 415 });
	});
});
