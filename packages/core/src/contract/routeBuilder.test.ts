import { type } from "../standard-schema/type.ts";
import type { BodyContent } from "./body.ts";
import { RouteBuilder, route } from "./routeBuilder.ts";

const schema = type<{ name: string }>();

describe("routeBuilder", () => {
	it("reuses partial routes without sharing later declarations", () => {
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
				.streamResponse(schema, { headers, description: "Events" })["~restrpc"]
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
			new RouteBuilder().response(schema).streamResponse(schema),
		).toThrow('Response status "200" has already been declared.');
	});

	it.each([99, 600, 200.5, NaN])("rejects invalid HTTP status %s", (status) => {
		expect(() => new RouteBuilder().response({ status })).toThrow(
			"Invalid HTTP response status",
		);
	});
});
