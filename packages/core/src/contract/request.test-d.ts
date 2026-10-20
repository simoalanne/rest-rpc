import { route } from "./routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { InferClientRequest } from "../client/request.ts";
import type { ServerRequest } from "./request.ts";

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
		expectTypeOf<ServerRequest<(typeof value)["~restrpc"]>>().toEqualTypeOf<{
			contentType: "application/json";
			body: { first: number; second: number; shared: string };
			params: { id: number };
			query: { page: number };
		}>();
	});

	it("discriminates body variants by media type", () => {
		const single = route.post("/").body({ "text/plain": type<string>() });
		expectTypeOf<InferClientRequest<typeof single>>().toEqualTypeOf<{
			contentType?: "text/plain";
			body: string;
		}>();

		const value = route
			.post("/")
			.body(type<{ url: string }>())
			.body({ "multipart/form-data": type<FormData>() })
			.query(type<{ dryRun?: boolean }>());
		expectTypeOf<InferClientRequest<typeof value>>().toEqualTypeOf<
			| {
					contentType: "application/json";
					body: { url: string };
					query: { dryRun?: boolean };
			  }
			| {
					contentType: "multipart/form-data";
					body: FormData;
					query: { dryRun?: boolean };
			  }
		>();
		expectTypeOf<ServerRequest<(typeof value)["~restrpc"]>>().toEqualTypeOf<
			| {
					contentType: "application/json";
					body: { url: string };
					query: { dryRun?: boolean };
			  }
			| {
					contentType: "multipart/form-data";
					body: FormData;
					query: { dryRun?: boolean };
			  }
		>();
	});

	it("distinguishes segmented and empty requests", () => {
		const empty = route.get("/");
		expectTypeOf<InferClientRequest<typeof empty>>().toEqualTypeOf<undefined>();
		expectTypeOf<ServerRequest<(typeof empty)["~restrpc"]>>().toEqualTypeOf<
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

	it("makes headers guaranteed by global headers optional", () => {
		const value = route
			.get("/")
			.headers(type<{ token: string; optional?: string }>());
		const globalHeaders = { token: async () => "token" };
		expectTypeOf<
			InferClientRequest<typeof value, typeof globalHeaders>
		>().toEqualTypeOf<{ headers?: { token?: string; optional?: string } }>();
		const uncertainHeaders = { token: (): string | undefined => undefined };
		expectTypeOf<
			InferClientRequest<typeof value, typeof uncertainHeaders>
		>().toEqualTypeOf<{ headers: { token: string; optional?: string } }>();
		const tree = { users: { value } };
		expectTypeOf<
			InferClientRequest<typeof tree, typeof globalHeaders>["users"]["value"]
		>().toEqualTypeOf<InferClientRequest<typeof value, typeof globalHeaders>>();
	});

	it("infers requests for a route tree", () => {
		const get = route.get("/users/{id}").params(type<{ id: string }>());
		const tree = { users: { get } };
		expectTypeOf<
			InferClientRequest<typeof tree>["users"]["get"]
		>().toEqualTypeOf<InferClientRequest<typeof get>>();
	});
});
