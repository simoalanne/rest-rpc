import { type } from "../standard-schema/type.ts";
import { route } from "./routeBuilder.ts";
import { resolveRouteRequest } from "./routeRequest.ts";

describe("resolveRouteRequest", () => {
	const schema = type<{ name: string }>();
	const headers = type<{ authorization: string }>();

	it("moves GET flat input to query and drops the content type", () => {
		const value = route.headers(headers).input(schema).get("/users");
		expect(resolveRouteRequest(value["~restrpc"])).toEqual({
			headers: [headers],
			query: [schema],
		});
	});

	it("moves other flat input to body with its content type", () => {
		const value = route.input(schema, { contentType: "text/plain" });
		expect(resolveRouteRequest(value["~restrpc"])).toEqual({
			body: [schema],
			contentType: "text/plain",
		});
	});

	it("returns request segments unchanged", () => {
		const value = route.get("/users").query(schema)["~restrpc"];
		expect(resolveRouteRequest(value)).toBe(value.request);
	});
});
