import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
	createMcpHandler,
	fromJsonSchema,
	McpServer,
} from "@modelcontextprotocol/server";
import {
	createToolsFromRoutes,
	mergeTools,
	type AgentTool,
} from "@rest-rpc/server";
import { router, schemaConverter } from "./router.ts";

type Context = { user: string | undefined };

// The wiring a user writes: a server per request with the tools registered,
// and the user read from the request.
const serve = (tools: AgentTool<Context>[]) =>
	createMcpHandler(({ requestInfo }) => {
		const server = new McpServer({ name: "blog", version: "1.0.0" });
		const user = requestInfo?.headers.get("authorization") ?? undefined;
		for (const tool of tools) {
			const { name, inputSchema, outputSchema, ...config } = tool.definition;
			server.registerTool(
				name,
				{
					...config,
					inputSchema: fromJsonSchema(inputSchema),
					...(outputSchema && { outputSchema: fromJsonSchema(outputSchema) }),
				},
				(args, { mcpReq }) =>
					tool.call(args, { context: { user }, signal: mcpReq.signal }),
			);
		}
		return server;
	});

const connect = async (
	tools: AgentTool<Context>[],
	headers: Record<string, string> = {},
) => {
	const handler = serve(tools);
	const client = new Client({ name: "test", version: "1.0.0" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
			requestInit: { headers },
			fetch: (url, init) => handler.fetch(new Request(url, init)),
		}),
	);
	return client;
};

describe("tools from routes on an MCP server", () => {
	const tools = createToolsFromRoutes(router, { schemaConverter });

	it("lists the routes as tools", async () => {
		const client = await connect(tools);
		const { tools: listed } = await client.listTools();
		expect(listed.map((tool) => tool.name)).toEqual([
			"posts_list",
			"posts_get",
			"posts_create",
		]);
		expect(listed[1]).toMatchObject({
			title: "Get a post",
			annotations: { readOnlyHint: true },
			inputSchema: {
				properties: { params: { properties: { id: { type: "string" } } } },
				required: ["params"],
			},
			outputSchema: { properties: { title: { type: "string" } } },
		});
	});

	it("calls routes with structured results and errors", async () => {
		const client = await connect(tools);
		expect(
			await client.callTool({
				name: "posts_get",
				arguments: { params: { id: "1" } },
			}),
		).toMatchObject({
			structuredContent: { id: "1", title: "Hello", body: "First post" },
		});
		expect(
			await client.callTool({
				name: "posts_list",
				arguments: { query: { title: "Hel" } },
			}),
		).toMatchObject({ structuredContent: { posts: [{ id: "1" }] } });

		const missing = await client.callTool({
			name: "posts_get",
			arguments: { params: { id: "9" } },
		});
		expect(missing.isError).toBe(true);
		expect(
			JSON.parse((missing.content as { text: string }[])[0]!.text),
		).toMatchObject({
			code: "POST_NOT_FOUND",
			data: { id: "9" },
		});
	});

	it("runs middleware with context from the MCP request", async () => {
		const body = { title: "Hi", body: "Second post" };
		const anonymous = await connect(tools);
		expect(
			await anonymous.callTool({ name: "posts_create", arguments: { body } }),
		).toMatchObject({ isError: true });

		const signedIn = await connect(tools, { authorization: "ada" });
		expect(
			await signedIn.callTool({ name: "posts_create", arguments: { body } }),
		).toMatchObject({ structuredContent: { title: "Hi" } });
	});

	it("serves every route through merged tools", async () => {
		const client = await connect(Object.values(mergeTools(tools)));
		const { tools: listed } = await client.listTools();
		expect(listed.map((tool) => tool.name)).toEqual([
			"find_routes",
			"call_route",
		]);

		const found = await client.callTool({
			name: "find_routes",
			arguments: { names: ["posts_get"] },
		});
		expect(found).toMatchObject({
			structuredContent: { routes: [{ name: "posts_get", inputSchema: {} }] },
		});
		expect(
			await client.callTool({
				name: "call_route",
				arguments: { route: "posts_get", params: { id: "1" } },
			}),
		).toMatchObject({ structuredContent: { title: "Hello" } });
	});
});
