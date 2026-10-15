import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { type } from "../standard-schema/type.ts";
import { route } from "./routeBuilder.ts";

describe("routeBuilder types", () => {
	it("preserves method, path and response status literals", () => {
		const value = route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(200, type<string>());
		expectTypeOf(value["~restrpc"].method).toEqualTypeOf<"GET">();
		expectTypeOf(value["~restrpc"].path).toEqualTypeOf<"/users/{id}">();
		expectTypeOf<
			keyof (typeof value)["~restrpc"]["responses"]
		>().toEqualTypeOf<200>();
	});

	it("normalizes declarations without expanding schemas", () => {
		const schema = type<{ name: string }>();
		const value = route.body(schema).response(200, schema);
		expectTypeOf(value["~restrpc"]).toEqualTypeOf<{
			readonly method: "POST";
			readonly path: undefined;
			request: {
				body: readonly [StandardSchemaV1<{ name: string }>];
				contentType: "application/json";
			};
			responses: {
				200: {
					body: StandardSchemaV1<{ name: string }>;
					contentType: "application/json";
				};
			};
		}>();
	});

	it("keeps descriptions out of declaration types and accepts stream headers", () => {
		const schema = type<string>();
		const headers = type<{ "x-cursor": string }>();
		const output = route.response(200, schema, { description: "Name" });
		expectTypeOf(output["~restrpc"].responses).toEqualTypeOf<{
			200: { body: typeof schema; contentType: "application/json" };
		}>();
		const stream = route.get("/events").streamResponse(200, schema, {
			headers,
			description: "Events",
		});
		expectTypeOf(stream["~restrpc"].responses).toEqualTypeOf<{
			200: { kind: "stream"; body: typeof schema; headers: typeof headers };
		}>();
	});

	it("removes builder operations incompatible with the selected state", () => {
		expectTypeOf(route).not.toHaveProperty("input");
		expectTypeOf(route).not.toHaveProperty("output");
		expectTypeOf(route).not.toHaveProperty("streamOutput");
		expectTypeOf(route.get()).not.toHaveProperty("post");
		expectTypeOf(route.metadata({})).not.toHaveProperty("metadata");
	});
});
