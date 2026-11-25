import { raw, routeError, sse, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { route } from "../builder/routeBuilder.ts";
import { createToolsFromRoutes, type ToolResult } from "./toolsFromRoutes.ts";

// Schemas whose JSON Schema the converter returns, as a schema library's would.
const jsonSchemas = new WeakMap<StandardSchemaV1, Record<string, unknown>>();
const schema = <T>(json: Record<string, unknown>): StandardSchemaV1<T, T> => {
	const created = type<T>();
	jsonSchemas.set(created, json);
	return created;
};
const schemaConverter = (value: StandardSchemaV1) => jsonSchemas.get(value);

const post = { id: "1", title: "Hello", body: "First post" };
const postJson = { type: "object", properties: { id: { type: "string" } } };

const errorOf = (result: ToolResult) => JSON.parse(result.content[0]!.text);

describe("createToolsFromRoutes", () => {
	it("creates a tool for each route that takes and returns JSON", () => {
		const tools = createToolsFromRoutes(
			{
				posts: {
					get: route
						.get("/posts/:id")
						.response(schema<typeof post>(postJson))
						.openAPI({ summary: "Get a post" })
						.handler(() => post),
					import: route
						.post("/posts/import")
						.headers(
							schema<{ "content-type": "text/csv" }>({
								type: "object",
								properties: { "content-type": { const: "text/csv" } },
							}),
						)
						.body(type<string>())
						.handler(() => undefined),
					events: route
						.get("/posts/events")
						.response(sse(type<typeof post>()))
						.handler(async function* () {}),
					file: route
						.get("/posts/file")
						.response(raw())
						.handler(() => new Response()),
				},
			},
			{ schemaConverter },
		);
		expect(tools).toHaveLength(1);
		expect(tools[0]!.routePath).toEqual(["posts", "get"]);
		expect(tools[0]!.definition).toEqual({
			name: "posts_get",
			title: "Get a post",
			description: "Get a post",
			inputSchema: {
				type: "object",
				properties: {
					params: {
						type: "object",
						properties: { id: { type: "string" } },
						required: ["id"],
					},
				},
				required: ["params"],
			},
			outputSchema: postJson,
			annotations: { readOnlyHint: true },
		});
	});

	it("returns the body as structured content and text", async () => {
		const [object, text, empty] = createToolsFromRoutes({
			object: route.get("/object").handler(() => ({ at: new Date(0) })),
			text: route.get("/text").handler(() => "hi"),
			empty: route.delete("/empty").handler(() => undefined),
		});
		const at = new Date(0).toJSON();
		expect(await object!.call({})).toEqual({
			content: [{ type: "text", text: JSON.stringify({ at }) }],
			structuredContent: { at },
		});
		expect(await text!.call({})).toEqual({
			content: [{ type: "text", text: "hi" }],
			structuredContent: "hi",
		});
		expect(await empty!.call({})).toEqual({ content: [] });
	});

	it("returns errors as results and reports them", async () => {
		const onError = vi.fn();
		const failure = new Error("database password is hunter2");
		const NotFound = routeError("POST_NOT_FOUND", {
			status: 404,
			data: type<{ id: string }>(),
		});
		const [missing, broken, binary] = createToolsFromRoutes(
			{
				missing: route
					.get("/posts/:id")
					.error(NotFound)
					.handler(({ params, errors }) => {
						throw errors.POST_NOT_FOUND({ data: params });
					}),
				broken: route.get("/broken").handler(() => {
					throw failure;
				}),
				binary: route.get("/binary").handler(() => new Blob(["data"])),
			},
			{ onError },
		);

		const notFound = await missing!.call({ params: { id: "2" } });
		expect(notFound.isError).toBe(true);
		expect(errorOf(notFound)).toEqual({
			code: "POST_NOT_FOUND",
			status: 404,
			message: expect.any(String),
			data: { id: "2" },
			defined: true,
		});
		expect(onError).toHaveBeenLastCalledWith(
			expect.objectContaining({ code: "POST_NOT_FOUND" }),
		);

		const internal = await broken!.call({});
		expect(internal.content[0]!.text).not.toContain("hunter2");
		expect(errorOf(internal)).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(onError).toHaveBeenLastCalledWith(
			expect.objectContaining({
				code: "INTERNAL_SERVER_ERROR",
				cause: failure,
			}),
		);

		expect(errorOf(await binary!.call({}))).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
		});
	});

	it("passes context, and host headers over the model's", async () => {
		const [me] = createToolsFromRoutes({
			me: route
				.$context<{ user: string }>()
				.get("/me")
				.headers(type<{ authorization: string }>())
				.handler(({ context, headers }) => ({
					user: context.user,
					authorization: headers.authorization,
				})),
		});
		const result = await me!.call(
			{ headers: { authorization: "from the model" } },
			{ context: { user: "ada" }, headers: { authorization: "Bearer token" } },
		);
		expect(result.structuredContent).toEqual({
			user: "ada",
			authorization: "Bearer token",
		});
	});

	it("throws when two routes have the same tool name", () => {
		const handler = route.get("/").handler(() => "ok");
		expect(() =>
			createToolsFromRoutes({ "a.b": handler, a_b: handler }),
		).toThrow();
	});
});
