import { route } from "./routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { InferClientRequest, InferServerRequest } from "./request.ts";

describe("request inference", () => {
	it("intersects stacked inputs and right-merges transformed outputs", () => {
		const value = route
			.post("/")
			.body(
				type((input: { first: string; shared: string }) => ({
					first: Number(input.first),
					shared: 1,
				})),
			)
			.body(
				type((input: { second: string; shared: string }) => ({
					second: Number(input.second),
					shared: "later",
				})),
			)
			.params(type((input: { id: string }) => ({ id: Number(input.id) })))
			.query(type((input: { page: string }) => ({ page: Number(input.page) })));
		expectTypeOf<InferClientRequest<typeof value>["body"]>().toEqualTypeOf<
			{ first: string; shared: string } & { second: string; shared: string }
		>();
		expectTypeOf<InferServerRequest<typeof value>>().toEqualTypeOf<{
			body: { first: number; second: number; shared: string };
			params: { id: number };
			query: { page: number };
		}>();
	});

	it("distinguishes flat GET, flat POST, segmented and empty requests", () => {
		const schema = type((input: { count: string }) => ({
			count: Number(input.count),
		}));
		const get = route.get("/").input(schema);
		const post = route.post("/").input(schema);
		const procedure = route.input(schema);
		expectTypeOf<InferClientRequest<typeof get>>().toEqualTypeOf<{
			count: string;
		}>();
		expectTypeOf<InferClientRequest<typeof post>>().toEqualTypeOf<{
			count: string;
		}>();
		expectTypeOf<InferServerRequest<typeof get>>().toEqualTypeOf<{
			input: { count: number };
		}>();
		expectTypeOf<InferServerRequest<typeof procedure>>().toEqualTypeOf<{
			input: { count: number };
		}>();
		const empty = route.get("/");
		expectTypeOf<InferClientRequest<typeof empty>>().toEqualTypeOf<never>();
		expectTypeOf<InferServerRequest<typeof empty>>().toEqualTypeOf<
			Record<never, never>
		>();
	});

	it("infers required and optional request headers", () => {
		const value = route
			.get("/")
			.headers(type<{ token: string; optional?: string }>());
		expectTypeOf<InferClientRequest<typeof value>>().toEqualTypeOf<{
			headers: { token: string; optional?: string };
		}>();
		const optional = route.get("/").headers(type<{ token?: string }>());
		expectTypeOf<InferClientRequest<typeof optional>>().toEqualTypeOf<{
			headers?: { token?: string };
		}>();
	});
});
