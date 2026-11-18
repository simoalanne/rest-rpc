import { type } from "../standard-schema/type.ts";
import { extractContract } from "./extract.ts";
import { RouteBuilder, route } from "./routeBuilder.ts";
import { routeError } from "./routeError.ts";
import { sse } from "./sse.ts";

const schema = type<{ name: string }>();
const json = { body: null };

describe("routeBuilder", () => {
	it("reuses partial routes without sharing later definitions", () => {
		const base = route.body(schema);
		const contract = extractContract({
			base,
			first: base.response(schema),
			second: base.response(schema, { status: 201 }),
		});
		expect(contract.base["~restrpc"].responses).toEqual({});
		expect(contract.first["~restrpc"].responses).toEqual({ 200: json });
		expect(contract.second["~restrpc"].responses).toEqual({ 201: json });
	});

	// Literal statuses are a type error, so only a status typed `number` gets here.
	it("rejects duplicate response statuses across stream and body responses", () => {
		const status: number = 200;
		expect(() =>
			new RouteBuilder().response(schema).response(sse(schema), { status }),
		).toThrow();
	});

	it.each([199, 300, 404, 200.5, NaN])(
		"rejects the response status %s outside 2xx",
		(status) => {
			expect(() => new RouteBuilder().response({ status })).toThrow();
		},
	);

	it("defines errors by definition or inline and rejects conflicting codes", () => {
		const Unauthorized = routeError("UNAUTHORIZED", { status: 401 });
		const authed = route.error(Unauthorized);
		const value = authed.error(Unauthorized).error("INVALID", { data: schema });
		const contract = extractContract({ authed, value });
		expect(contract.value["~restrpc"].errors).toEqual({
			UNAUTHORIZED: { status: 401 },
			INVALID: { status: 400 },
		});
		expect(contract.authed["~restrpc"].responses).toEqual({});
		expect(() => authed.error("UNAUTHORIZED")).toThrow();
	});

	it("prepends prefixes in order to method paths and tree-derived paths", () => {
		const api = route.prefix("/api").prefix("/v1");
		const contract = extractContract({
			posts: api.get("/posts"),
			root: api.get("/"),
			list: api.get(),
		});
		expect(contract.posts["~restrpc"].path).toBe("/api/v1/posts");
		expect(contract.root["~restrpc"].path).toBe("/api/v1");
		expect(contract.list["~restrpc"].path).toBe("/api/v1/list");
	});
});
