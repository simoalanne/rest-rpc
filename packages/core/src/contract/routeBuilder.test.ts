import { type } from "../standard-schema/type.ts";
import { RouteBuilder, route } from "./routeBuilder.ts";

const schema = type<{ name: string }>();

describe("routeBuilder", () => {
	it("reuses partial routes without sharing later declarations", () => {
		const base = route.input(schema);
		const first = base.output(schema);
		const second = base.response(201, schema);
		expect(base["~restrpc"].responses).toEqual({});
		expect(first["~restrpc"].responses).toEqual({
			200: { body: schema, contentType: "application/json" },
		});
		expect(second["~restrpc"].responses).toEqual({
			201: { body: schema, contentType: "application/json" },
		});
	});

	it("moves flat input to query when selecting GET and retains headers", () => {
		const headers = type<{ authorization: string }>();
		const value = route.headers(headers).input(schema).get("/users")[
			"~restrpc"
		];
		expect(value.request).toEqual({ headers: [headers], query: [schema] });
	});

	it("rejects mixing flat input and request segments in either order", () => {
		expect(() => new RouteBuilder().input(schema).query(schema)).toThrow(
			"Cannot combine flat input with request segments.",
		);
		expect(() => new RouteBuilder().query(schema).input(schema)).toThrow(
			"Cannot combine flat input with request segments.",
		);
	});

	it("rejects GET bodies regardless of declaration order", () => {
		expect(() => new RouteBuilder().get().body(schema)).toThrow(
			"GET routes cannot declare a request body.",
		);
		expect(() => new RouteBuilder().body(schema).get()).toThrow(
			"GET routes cannot declare a request body.",
		);
	});

	it.each(["/users/:id", "/users/{id}"] as const)(
		"rejects flat input with path parameters in %s",
		(path) => {
			expect(() => new RouteBuilder().get(path).input(schema)).toThrow(
				"Flat input requires a static route path.",
			);
			expect(() => new RouteBuilder().input(schema).get(path)).toThrow(
				"Flat input requires a static route path.",
			);
		},
	);

	it("rejects selecting the HTTP method twice", () => {
		expect(() => new RouteBuilder().get().post()).toThrow(
			"Route method and path have already been selected.",
		);
	});

	it("rejects mixing plain output and response envelopes", () => {
		expect(() =>
			new RouteBuilder().output(schema).response(201, schema),
		).toThrow("Cannot combine plain output with response envelopes.");
		expect(() =>
			new RouteBuilder().response(201, schema).output(schema),
		).toThrow("Cannot combine plain output with response envelopes.");
	});

	it("rejects duplicate response statuses across stream and body responses", () => {
		expect(() =>
			new RouteBuilder().response(200, schema).streamResponse(200, schema),
		).toThrow('Response status "200" has already been declared.');
	});

	it.each([99, 600, 200.5, NaN])("rejects invalid HTTP status %s", (status) => {
		expect(() => new RouteBuilder().response(status)).toThrow(
			"Invalid HTTP response status",
		);
	});
});
