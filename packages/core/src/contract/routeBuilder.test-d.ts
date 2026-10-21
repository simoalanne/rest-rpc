import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { type } from "../standard-schema/type.ts";
import { route } from "./routeBuilder.ts";
import type { OpenApiRouteOptions } from "./routeDeclaration.ts";

describe("routeBuilder types", () => {
	it("preserves method, path and response status literals", () => {
		const value = route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(type<string>());
		expectTypeOf(value["~restrpc"].method).toEqualTypeOf<"GET">();
		expectTypeOf(value["~restrpc"].path).toEqualTypeOf<"/users/{id}">();
		expectTypeOf<
			keyof (typeof value)["~restrpc"]["responses"]
		>().toEqualTypeOf<200>();
	});

	it("normalizes declarations without expanding schemas", () => {
		const schema = type<{ name: string }>();
		const value = route.body(schema).response(schema);
		expectTypeOf(value["~restrpc"]).toEqualTypeOf<{
			readonly method: "POST";
			readonly path: undefined;
			request: {
				body: {
					"application/json": readonly [StandardSchemaV1<{ name: string }>];
				};
			};
			responses: {
				200: {
					content: { "application/json": StandardSchemaV1<{ name: string }> };
				};
			};
		}>();
	});

	it("keeps descriptions out of declaration types and accepts stream headers", () => {
		const schema = type<string>();
		const headers = type<{ "x-cursor": string }>();
		const output = route.response(schema, { description: "Name" });
		expectTypeOf(output["~restrpc"].responses).toEqualTypeOf<{
			200: { content: { "application/json": typeof schema } };
		}>();
		const stream = route.get("/events").streamResponse(schema, {
			headers,
			description: "Events",
		});
		expectTypeOf(stream["~restrpc"].responses).toEqualTypeOf<{
			200: {
				content: { "text/event-stream": typeof schema };
				headers: typeof headers;
			};
		}>();
	});

	it("removes builder operations incompatible with the selected state", () => {
		expectTypeOf(route).not.toHaveProperty("input");
		expectTypeOf(route).not.toHaveProperty("output");
		expectTypeOf(route).not.toHaveProperty("streamOutput");
		expectTypeOf(route.get()).not.toHaveProperty("post");
		expectTypeOf(route.get()).not.toHaveProperty("body");
		expectTypeOf(route.body(type<string>())).not.toHaveProperty("get");
		expectTypeOf(route.body(type<string>())).toHaveProperty("post");
		expectTypeOf(route.post()).toHaveProperty("body");
	});

	it("merges repeated metadata and OpenAPI details", () => {
		const value = route
			.metadata({ auth: "required", scope: "read" })
			.openAPI({ tags: ["Todos"] })
			.metadata({ scope: "write" })
			.openAPI({ summary: "List todos" });
		expectTypeOf(value["~restrpc"].metadata).toEqualTypeOf<{
			readonly auth: "required";
			readonly scope: "write";
		}>();
		expectTypeOf(
			value["~restrpc"].openApi,
		).toEqualTypeOf<OpenApiRouteOptions>();
	});

	it("defaults response statuses to 200 and reads them from options", () => {
		const value = route
			.get("/")
			.response(type<string>())
			.response({ status: 204 })
			.streamResponse(type<number>(), { status: 206 });
		expectTypeOf<keyof (typeof value)["~restrpc"]["responses"]>().toEqualTypeOf<
			200 | 204 | 206
		>();
		expectTypeOf(route.response()["~restrpc"].responses).toEqualTypeOf<{
			200: {};
		}>();
	});

	it("rejects optional params schema keys", () => {
		route.get("/users/:id").params(type<{ id: string }>());
		// @ts-expect-error Path params are always present.
		route.get("/users/:id").params(type<{ id?: string }>());
		// @ts-expect-error Extra optional keys are never provided.
		route.get("/users/:id").params(type<{ id: string; include?: string }>());
	});
});
