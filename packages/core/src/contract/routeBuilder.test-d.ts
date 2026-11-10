import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { type } from "../standard-schema/type.ts";
import { route } from "./routeBuilder.ts";
import { sse } from "./sse.ts";
import { routeError } from "./routeError.ts";
import type { DefaultMeta, OpenApiRouteOptions } from "./routeDefinition.ts";

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

	it("normalizes definitions without expanding schemas", () => {
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
			readonly metaShape?: DefaultMeta;
		}>();
	});

	it("keeps descriptions out of definition types and accepts stream headers", () => {
		const schema = type<string>();
		const headers = type<{ "x-cursor": string }>();
		const output = route.response(schema, { description: "Name" });
		expectTypeOf(output["~restrpc"].responses).toEqualTypeOf<{
			200: { content: { "application/json": typeof schema } };
		}>();
		const stream = route.get("/events").response(sse(schema), {
			headers,
			description: "Events",
		});
		expectTypeOf(stream["~restrpc"].responses).toEqualTypeOf<{
			200: {
				content: { readonly "text/event-stream": typeof schema };
				headers: typeof headers;
			};
		}>();
		const both = route.response({
			...sse(schema),
			"application/json": schema,
		});
		expectTypeOf(both["~restrpc"].responses[200].content).toEqualTypeOf<{
			readonly "text/event-stream": typeof schema;
			readonly "application/json": typeof schema;
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

	it("merges repeated meta and OpenAPI details", () => {
		const value = route
			.$meta<{ auth: "required" | "optional"; scope: string }>()
			.meta({ auth: "required", scope: "read" })
			.openAPI({ tags: ["Todos"] })
			.meta({ scope: "write" })
			.openAPI({ summary: "List todos" });
		expectTypeOf(value["~restrpc"].meta).toEqualTypeOf<{
			readonly auth: "required";
			readonly scope: "write";
		}>();
		expectTypeOf(
			value["~restrpc"].openApi,
		).toEqualTypeOf<OpenApiRouteOptions>();
	});

	it("offers meta once a shape is declared and checks values against it", () => {
		expectTypeOf(route).not.toHaveProperty("meta");
		const value = route
			.$meta<{ auth: boolean; scope: string }>()
			.get()
			.$meta<{ scope: number }>();
		value.meta({ auth: true, scope: 1 });
		// @ts-expect-error `scope` is a number in the later shape.
		value.meta({ scope: "read" });
	});

	it("defaults response statuses to 200 and reads them from options", () => {
		const value = route
			.get("/")
			.response(type<string>())
			.response({ status: 204 })
			.response(sse(type<number>()), { status: 206 });
		expectTypeOf<keyof (typeof value)["~restrpc"]["responses"]>().toEqualTypeOf<
			200 | 204 | 206
		>();
		expectTypeOf(route.response()["~restrpc"].responses).toEqualTypeOf<{
			200: {};
		}>();
	});

	it("accumulates defined errors by code and keeps methods selectable", () => {
		const Unauthorized = routeError("UNAUTHORIZED", { status: 401 });
		const authed = route.error(Unauthorized);
		const value = authed.get("/me").error("INVALID", { data: type<string>() });
		expectTypeOf(value["~restrpc"].errors.UNAUTHORIZED).toEqualTypeOf<
			typeof Unauthorized
		>();
		expectTypeOf(value["~restrpc"].errors.INVALID.status).toEqualTypeOf<400>();
		expectTypeOf(value["~restrpc"].responses).toEqualTypeOf<{}>();
	});

	it("rejects optional params schema keys", () => {
		route.get("/users/:id").params(type<{ id: string }>());
		// @ts-expect-error Path params are always present.
		route.get("/users/:id").params(type<{ id?: string }>());
		// @ts-expect-error Extra optional keys are never provided.
		route.get("/users/:id").params(type<{ id: string; include?: string }>());
	});

	it("only allows prefixes before a method is selected", () => {
		// @ts-expect-error A method path already includes the prefix.
		route.get("/todos").prefix("/api");
	});
});
