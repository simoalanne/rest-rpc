import { routeError, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { route } from "../builder/routeBuilder.ts";
import { sse } from "@rest-rpc/core";
import { mergeTools } from "./mergeTools.ts";
import { createToolsFromRoutes } from "./toolsFromRoutes.ts";

// Schemas whose JSON Schema the converter returns, as a schema library's would.
const jsonSchemas = new WeakMap<StandardSchemaV1, Record<string, unknown>>();
const schema = <T>(json: Record<string, unknown>): StandardSchemaV1<T, T> => {
	const created = type<T>();
	jsonSchemas.set(created, json);
	return created;
};
const schemaConverter = (value: StandardSchemaV1) => jsonSchemas.get(value);

const post = { id: "1", title: "Hello", body: "First post" };
const postSchema = schema<typeof post>({
	type: "object",
	properties: {
		id: { type: "string" },
		title: { type: "string" },
		body: { type: "string" },
	},
	required: ["id", "title", "body"],
});

const NotFound = routeError("POST_NOT_FOUND", {
	status: 404,
	data: type<{ id: string }>(),
});

const router = {
	posts: {
		get: route
			.get("/posts/:id")
			.error(NotFound)
			.response(postSchema)
			.openAPI({ summary: "Get a post" })
			.handler(({ params, errors }) => {
				if (params.id !== "1") throw errors.POST_NOT_FOUND({ data: params });
				return post;
			}),
		create: route
			.post("/posts")
			.body(
				schema<{ title: string; body: string }>({
					type: "object",
					properties: { title: { type: "string" }, body: { type: "string" } },
				}),
			)
			.handler(({ body }) => ({ id: "2", ...body })),
		remove: route.delete("/posts/:id").handler(() => undefined),
		stream: route
			.get("/posts/stream")
			.response(sse(postSchema))
			.handler(async function* () {
				yield post;
			}),
	},
};

const toolNamed = (
	tools: ReturnType<typeof createToolsFromRoutes>,
	name: string,
) => tools.find((tool) => tool.definition.name === name)!;

describe("createToolsFromRoutes", () => {
	it("derives tool definitions from routes", () => {
		const tools = createToolsFromRoutes(router, { schemaConverter });
		expect(tools.map((tool) => tool.definition.name)).toEqual([
			"posts_get",
			"posts_create",
			"posts_remove",
		]);
		expect(toolNamed(tools, "posts_get").definition).toEqual({
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
			outputSchema: jsonSchemas.get(postSchema),
			annotations: { readOnlyHint: true },
		});
		// Without a defined response, the body is not described.
		expect(
			toolNamed(tools, "posts_create").definition.outputSchema,
		).toBeUndefined();
		expect(toolNamed(tools, "posts_remove").definition.annotations).toEqual({
			idempotentHint: true,
		});
	});

	it("leaves `$schema` out of converted schemas", () => {
		const [tool] = createToolsFromRoutes(
			{ create: router.posts.create },
			{
				schemaConverter: () => ({
					$schema: "https://json-schema.org/draft/2020-12/schema",
					type: "object",
				}),
			},
		);
		expect(JSON.stringify(tool!.definition)).not.toContain("$schema");
	});

	it("calls the route and returns an object body as structured content", async () => {
		const tools = createToolsFromRoutes(router, { schemaConverter });
		expect(
			await toolNamed(tools, "posts_get").call({ params: { id: "1" } }),
		).toEqual({
			content: [{ type: "text", text: JSON.stringify(post) }],
			structuredContent: post,
		});
		expect(
			await toolNamed(tools, "posts_create").call({
				body: { title: "Hi", body: "Second" },
			}),
		).toMatchObject({
			structuredContent: { id: "2", title: "Hi", body: "Second" },
		});
	});

	it("passes context and host headers through middleware", async () => {
		const base = route
			.$context<{ user: string | undefined }>()
			.error("UNAUTHORIZED", { status: 401 })
			.use(({ context, errors, next }) => {
				if (!context.user) throw errors.UNAUTHORIZED();
				return next();
			});
		const [me] = createToolsFromRoutes(
			{
				me: base
					.get("/me")
					.headers(
						schema<{ authorization: string }>({
							type: "object",
							properties: { authorization: { type: "string" } },
							required: ["authorization"],
						}),
					)
					.handler(({ context, headers }) => ({
						user: context.user,
						authorization: headers.authorization,
					})),
			},
			{ schemaConverter },
		);

		expect(
			await me!.call(
				{ headers: { authorization: "from the model" } },
				{
					context: { user: "ada" },
					headers: { authorization: "Bearer token" },
				},
			),
		).toMatchObject({
			structuredContent: { user: "ada", authorization: "Bearer token" },
		});
		const denied = await me!.call({}, { context: { user: undefined } });
		expect(denied.isError).toBe(true);
		expect(JSON.parse(denied.content[0]!.text)).toMatchObject({
			code: "UNAUTHORIZED",
			status: 401,
		});
	});

	it("returns errors as results the model can read", async () => {
		const onError = vi.fn();
		const failure = new Error("database password is hunter2");
		const tools = createToolsFromRoutes(
			{
				...router,
				broken: route.get("/broken").handler(() => {
					throw failure;
				}),
			},
			{ schemaConverter, onError },
		);

		const missing = await toolNamed(tools, "posts_get").call({
			params: { id: "2" },
		});
		expect(missing.isError).toBe(true);
		expect(JSON.parse(missing.content[0]!.text)).toMatchObject({
			code: "POST_NOT_FOUND",
			status: 404,
			data: { id: "2" },
			defined: true,
		});

		const broken = await toolNamed(tools, "broken").call({});
		expect(broken.isError).toBe(true);
		expect(broken.content[0]!.text).not.toContain("hunter2");
		expect(JSON.parse(broken.content[0]!.text)).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			status: 500,
		});
		expect(onError).toHaveBeenCalledWith(failure);
	});

	it("returns request validation issues", async () => {
		const tools = createToolsFromRoutes({
			create: route
				.post("/posts")
				.body({
					"~standard": {
						version: 1,
						vendor: "test",
						validate: (value) =>
							typeof (value as { title?: unknown }).title === "string"
								? { value }
								: {
										issues: [{ message: "Expected a title", path: ["title"] }],
									},
					},
				})
				.handler(() => "ok"),
		});
		const result = await tools[0]!.call({ body: {} });
		expect(result.isError).toBe(true);
		expect(JSON.parse(result.content[0]!.text)).toMatchObject({
			status: 400,
			data: { body: [{ message: "Expected a title" }] },
		});
	});

	it("carries the route each tool calls", () => {
		const tools = createToolsFromRoutes({
			posts: {
				get: route
					.$meta<{ access: string }>()
					.get("/posts/:id")
					.meta({ access: "admin" })
					.handler(() => post),
			},
		});
		expect(tools[0]).toMatchObject({
			routePath: ["posts", "get"],
			route: { method: "GET", path: "/posts/:id", meta: { access: "admin" } },
		});
	});

	it("throws when two routes have the same tool name", () => {
		const handler = route.get("/").handler(() => "ok");
		expect(() =>
			createToolsFromRoutes({ "a.b": handler, a_b: handler }),
		).toThrow();
	});
});

describe("mergeTools", () => {
	const tools = createToolsFromRoutes(router, { schemaConverter });
	const { findRoutes: find, callRoute } = mergeTools(tools);
	const json = async (result: Promise<{ content: { text: string }[] }>) =>
		JSON.parse((await result).content[0]!.text);

	it("finds routes and their definitions", async () => {
		expect(await json(find.call({}))).toEqual({
			routes: [
				{ name: "posts_get", title: "Get a post", description: "Get a post" },
				{ name: "posts_create", description: "POST /posts" },
				{ name: "posts_remove", description: "DELETE /posts/:id" },
			],
		});
		expect(await json(find.call({ query: "get POST" }))).toEqual({
			routes: [
				{ name: "posts_get", title: "Get a post", description: "Get a post" },
			],
		});
		const { routes } = await json(find.call({ names: ["posts_create"] }));
		expect(routes[0]).toMatchObject({
			name: "posts_create",
			inputSchema: { required: ["body"] },
		});
	});

	it("calls a route by name", async () => {
		expect(
			await callRoute.call({ route: "posts_get", params: { id: "1" } }),
		).toMatchObject({ structuredContent: post });
		expect(await callRoute.call({ route: "posts_missing" })).toMatchObject({
			isError: true,
		});
	});

	it("throws when two tools have the same name", () => {
		const renamed = tools.map((tool) => ({
			...tool,
			definition: { ...tool.definition, name: "same" },
		}));
		expect(() => mergeTools(renamed)).toThrow();
	});
});
