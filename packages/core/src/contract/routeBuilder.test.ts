import { type } from "../standard-schema/type.ts";
import type { BodyContent } from "./body.ts";
import { resolveRoutePath } from "./path.ts";
import { RouteBuilder, route } from "./routeBuilder.ts";
import { routeError } from "./routeError.ts";
import { sse } from "./sse.ts";

const schema = type<{ name: string }>();

describe("routeBuilder", () => {
	it("reuses partial routes without sharing later definitions", () => {
		const base = route.body(schema);
		const first = base.response(schema);
		const second = base.response(schema, { status: 201 });
		expect(base["~restrpc"].responses).toEqual({});
		expect(first["~restrpc"].responses).toEqual({
			200: { content: { "application/json": schema } },
		});
		expect(second["~restrpc"].responses).toEqual({
			201: { content: { "application/json": schema } },
		});
	});

	it("stores response descriptions and stream response headers", () => {
		const headers = type<{ "x-cursor": string }>();
		expect(
			new RouteBuilder()
				.response({ status: 204, description: "Deleted" })
				.response(sse(schema), { headers, description: "Events" })["~restrpc"]
				.responses,
		).toEqual({
			204: { description: "Deleted" },
			200: {
				content: { "text/event-stream": schema },
				headers,
				description: "Events",
			},
		});
		expect(
			new RouteBuilder()
				.response(schema, { description: "Name" })
				.response({ "text/csv": schema }, { status: 201 })["~restrpc"]
				.responses,
		).toEqual({
			200: { content: { "application/json": schema }, description: "Name" },
			201: { content: { "text/csv": schema } },
		});
	});

	it("appends body schemas per media type", () => {
		const text = type<string>();
		expect(
			route
				.body(schema)
				.body({ "text/plain": text, "application/json": schema })["~restrpc"]
				.request.body,
		).toEqual({ "application/json": [schema, schema], "text/plain": [text] });
	});

	it.each(["Text/Plain", "text/plain; charset=utf-8"])(
		"rejects the media type key %s",
		(mediaType) => {
			const content = { [mediaType]: schema } as BodyContent;
			expect(() => route.body(content)).toThrow(
				`Media type "${mediaType}" must be a lowercase base media type such as "application/json".`,
			);
		},
	);

	it("rejects duplicate response statuses across stream and body responses", () => {
		expect(() =>
			new RouteBuilder().response(schema).response(sse(schema)),
		).toThrow('Response status "200" has already been defined.');
	});

	it.each([199, 300, 404, 200.5, NaN])(
		"rejects the response status %s outside 2xx",
		(status) => {
			expect(() => new RouteBuilder().response({ status })).toThrow(
				"must be from 200 to 299",
			);
		},
	);

	it("defines errors by definition or inline and rejects conflicting codes", () => {
		const Unauthorized = routeError("UNAUTHORIZED", { status: 401 });
		const authed = route.error(Unauthorized);
		const value = authed.error(Unauthorized).error("INVALID", { data: schema });
		expect(value["~restrpc"].errors.UNAUTHORIZED).toBe(Unauthorized);
		expect({ ...value["~restrpc"].errors.INVALID }).toMatchObject({
			code: "INVALID",
			status: 400,
			data: schema,
		});
		expect(authed["~restrpc"].responses).toEqual({});
		expect(() => authed.error("UNAUTHORIZED")).toThrow(
			'Error code "UNAUTHORIZED" has already been defined.',
		);
	});

	it("prepends prefixes in order to method paths and tree-derived paths", () => {
		const api = route.prefix("/api").prefix("/v1");
		expect(api.get("/todos")["~restrpc"].path).toBe("/api/v1/todos");
		expect(api.get("/")["~restrpc"].path).toBe("/api/v1");
		expect(resolveRoutePath(api.get()["~restrpc"], ["todos"])).toBe(
			"/api/v1/todos",
		);
	});

	it.each(["api", "/api/"])("rejects the prefix %s", (prefix) => {
		expect(() => route.prefix(prefix as `/${string}`)).toThrow(
			`Prefix "${prefix}" must start with a slash and not end with one`,
		);
	});
});
