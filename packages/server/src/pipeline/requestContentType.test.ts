import { route, type } from "@rest-rpc/core";
import { resolveRequestMediaType } from "./requestContentType.ts";

describe("resolveRequestMediaType", () => {
	const declaration = route.post("/").body({
		"text/plain": type<string>(),
		"application/json": type<{ name: string }>(),
	})["~restrpc"];

	it("selects declared media types from normalized content types", () => {
		expect(
			resolveRequestMediaType(declaration, "Text/Plain; charset=utf-8"),
		).toEqual({ mediaType: "text/plain", rejection: undefined });
		expect(resolveRequestMediaType(declaration, "image/png")).toMatchObject({
			rejection: { status: 415 },
		});
	});

	it("uses the only declared media type when the content type is missing", () => {
		const single = route.post("/").body(type<string>())["~restrpc"];
		expect(resolveRequestMediaType(single, null)).toEqual({
			mediaType: "application/json",
			rejection: undefined,
		});
		expect(resolveRequestMediaType(declaration, null)).toMatchObject({
			rejection: { status: 415 },
		});
	});

	it("rejects received content types when no request body is declared", () => {
		expect(
			resolveRequestMediaType(route.get("/")["~restrpc"], "application/json"),
		).toMatchObject({ rejection: { status: 415 } });
	});
});
