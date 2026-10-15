import { type } from "../standard-schema/type.ts";
import { RouteBuilder, route } from "./routeBuilder.ts";

const schema = type<{ name: string }>();

describe("routeBuilder", () => {
	it("reuses partial routes without sharing later declarations", () => {
		const base = route.body(schema);
		const first = base.response(schema);
		const second = base.response(schema, { status: 201 });
		expect(base["~restrpc"].responses).toEqual({});
		expect(first["~restrpc"].responses).toEqual({
			200: { body: schema, contentType: "application/json" },
		});
		expect(second["~restrpc"].responses).toEqual({
			201: { body: schema, contentType: "application/json" },
		});
	});

	it("rejects GET bodies regardless of declaration order", () => {
		expect(() => new RouteBuilder().get().body(schema)).toThrow(
			"GET routes cannot declare a request body.",
		);
		expect(() => new RouteBuilder().body(schema).get()).toThrow(
			"GET routes cannot declare a request body.",
		);
	});

	it("stores response descriptions and stream response headers", () => {
		const headers = type<{ "x-cursor": string }>();
		expect(
			new RouteBuilder()
				.response({ status: 204, description: "Deleted" })
				.streamResponse(schema, { headers, description: "Events" })[
				"~restrpc"
			].responses,
		).toEqual({
			204: { body: undefined, description: "Deleted" },
			200: { kind: "stream", body: schema, headers, description: "Events" },
		});
		expect(
			new RouteBuilder().response(schema, { description: "Name" })[
				"~restrpc"
			].responses,
		).toEqual({
			200: {
				body: schema,
				contentType: "application/json",
				description: "Name",
			},
		});
	});

	it("rejects duplicate response statuses across stream and body responses", () => {
		expect(() =>
			new RouteBuilder().response(schema).streamResponse(schema),
		).toThrow('Response status "200" has already been declared.');
	});

	it.each([99, 600, 200.5, NaN])("rejects invalid HTTP status %s", (status) => {
		expect(() => new RouteBuilder().response({ status })).toThrow(
			"Invalid HTTP response status",
		);
	});
});
