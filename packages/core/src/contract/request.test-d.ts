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

	it("infers string params from dynamic path segments without a params schema", () => {
		const value = route.get("/users/:id/posts/{slug}");
		expectTypeOf<InferClientRequest<typeof value>>().toEqualTypeOf<{
			params: { id: string; slug: string };
		}>();
		expectTypeOf<ServerRequest<(typeof value)["~restrpc"]>>().toEqualTypeOf<{
			params: { id: string; slug: string };
		}>();

		const withQuery = route.get("/users/:id").query(type<{ page: string }>());
		expectTypeOf<InferClientRequest<typeof withQuery>>().toEqualTypeOf<{
			params: { id: string };
			query: { page: string };
		}>();

		const explicit = route
			.get("/users/:id")
			.params(type((input: { id: string }) => ({ id: Number(input.id) })));
		expectTypeOf<ServerRequest<(typeof explicit)["~restrpc"]>>().toEqualTypeOf<{
			params: { id: number };
		}>();

		const staticPath = route.get("/users");
		expectTypeOf<
			InferClientRequest<typeof staticPath>
		>().toEqualTypeOf<undefined>();
	});

	it("lets clients omit segments the server always receives", () => {
		const optional = route
			.get("/")
			.query(type<{ page?: number }>())
			.headers(type<{ "x-trace"?: string }>());
		expectTypeOf<InferClientRequest<typeof optional>>().toEqualTypeOf<{
			query?: { page?: number };
			headers?: { "x-trace"?: string };
		}>();
		expectTypeOf<ServerRequest<(typeof optional)["~restrpc"]>>().toEqualTypeOf<{
			query: { page?: number };
			headers: { "x-trace"?: string };
		}>();

		// An omitted body is `undefined`, so only its schema can make it optional.
		const fields = route.post("/").body(type<{ note?: string }>());
		expectTypeOf<InferClientRequest<typeof fields>>().toEqualTypeOf<{
			contentType?: "application/json";
			body: { note?: string };
		}>();
		const omittable = route.post("/").body(type<string | undefined>());
		expectTypeOf<InferClientRequest<typeof omittable>>().toEqualTypeOf<{
			contentType?: "application/json";
			body?: string | undefined;
		}>();
		expectTypeOf<
			ServerRequest<(typeof omittable)["~restrpc"]>
		>().toEqualTypeOf<{
			contentType: "application/json";
			body: string | undefined;
		}>();

		// Without a body, there is no content type to select a media type with.
		const selected = route
			.post("/")
			.body(type<string | undefined>())
			.body({ "text/plain": type<string>() });
		expectTypeOf<InferClientRequest<typeof selected>>().toEqualTypeOf<
			| { contentType: "application/json"; body: string | undefined }
			| { contentType: "text/plain"; body: string }
		>();
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
					query?: { dryRun?: boolean };
			  }
			| {
					contentType: "multipart/form-data";
					body: FormData;
					query?: { dryRun?: boolean };
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

	it("infers params from prefixes", () => {
		const tenant = route.prefix("/tenants/:tenant");
		expectTypeOf<
			InferClientRequest<ReturnType<typeof tenant.get<"/todos/{id}">>>
		>().toEqualTypeOf<{ params: { tenant: string; id: string } }>();
		// A path derived from tree keys keeps the prefix params.
		expectTypeOf<
			InferClientRequest<ReturnType<typeof tenant.get<undefined>>>
		>().toEqualTypeOf<{ params: { tenant: string } }>();
	});
});
