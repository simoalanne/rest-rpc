import type { EmptyObject } from "@rest-rpc/core/utils";
import type {
	AgentTool,
	JsonValue,
	ToolDefinition,
	ToolResult,
} from "./toolsFromRoutes.ts";

const toJsonResult = (value: JsonValue): ToolResult => ({
	content: [{ type: "text", text: JSON.stringify(value) }],
	structuredContent: value,
});

const matches = (definition: ToolDefinition, words: readonly string[]) => {
	const text = [definition.name, definition.title, definition.description]
		.join(" ")
		.toLowerCase();
	return words.every((word) => text.includes(word));
};

// Tool names identify routes, so two with the same name throw when the tool is
// created instead of one being unreachable.
const toToolMap = <T extends { definition: ToolDefinition }>(
	tools: readonly T[],
) => {
	const byName = new Map<string, T>();
	for (const tool of tools) {
		if (byName.has(tool.definition.name)) {
			throw new Error(`Two tools have the name "${tool.definition.name}".`);
		}
		byName.set(tool.definition.name, tool);
	}
	return byName;
};

const createFindTool = (
	tools: readonly { definition: ToolDefinition }[],
	byName: ReadonlyMap<string, { definition: ToolDefinition }>,
): AgentTool => ({
	definition: {
		name: "find_routes",
		description:
			"Finds API routes. Without arguments, lists the name and description of every route. `query` lists only routes whose name, title or description contains every one of its words, ignoring case, so use words the routes are likely named or described with. `names` returns the definitions of those routes, whose `inputSchema` describes the arguments a route is called with.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				names: { type: "array", items: { type: "string" } },
			},
		},
		annotations: { readOnlyHint: true },
	},
	call: async ({ query, names }) => {
		if (Array.isArray(names)) {
			return toJsonResult({
				routes: names.flatMap(
					(name) => byName.get(String(name))?.definition ?? [],
				) as JsonValue[],
			});
		}
		const words =
			typeof query === "string"
				? query.toLowerCase().split(/\s+/).filter(Boolean)
				: [];
		return toJsonResult({
			routes: tools
				.filter((tool) => matches(tool.definition, words))
				.map(({ definition: { name, title, description } }) => ({
					name,
					...(title && { title }),
					...(description && { description }),
				})),
		});
	},
});

const createCallTool = <TContext extends object>(
	byName: ReadonlyMap<string, AgentTool<TContext>>,
): AgentTool<TContext> => ({
	definition: {
		name: "call_route",
		description:
			"Calls an API route by its name, with `params`, `query`, `headers` and `body` as the route's `inputSchema` describes.",
		inputSchema: {
			type: "object",
			properties: {
				route: { type: "string" },
				params: { type: "object" },
				query: { type: "object" },
				headers: { type: "object" },
				body: {},
			},
			required: ["route"],
		},
	},
	call: async ({ route, ...request }, ...options) => {
		const tool = byName.get(String(route));
		if (tool) return tool.call(request, ...options);
		const json = {
			code: "ROUTE_NOT_FOUND",
			message: `No route is named "${String(route)}".`,
		};
		return {
			content: [{ type: "text", text: JSON.stringify(json) }],
			isError: true,
		};
	},
});

/**
 * Merges tools into two, `find_routes` and `call_route`, so a model can use
 * every route without a tool for each. `find_routes` lists the tools by name
 * and description and returns the definitions a model asks for, and
 * `call_route` calls a tool by name. Their definitions stay the same size
 * however many tools there are.
 *
 * @remarks `find_routes` lists the tools whose name, title or description
 * contains every word of the query, ignoring case, so it finds what routes are
 * named and described as. Tool names identify the tools, so two with the same
 * name throw.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools#merge-tools}
 */
export function mergeTools<TContext extends object = EmptyObject>(
	tools: readonly AgentTool<TContext>[],
): {
	/** The `find_routes` tool, which finds tools and their definitions. It calls no route, so it takes no context. */
	findRoutes: AgentTool;
	/** The `call_route` tool, which calls a tool by name. */
	callRoute: AgentTool<TContext>;
} {
	const byName = toToolMap(tools);
	return {
		findRoutes: createFindTool(tools, byName),
		callRoute: createCallTool(byName),
	};
}
