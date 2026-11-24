import { createToolsFromRoutes, mergeTools } from "@rest-rpc/server";
import { generateText, jsonSchema, stepCountIs, tool, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { router, schemaConverter } from "./router.ts";

// The mapping a user writes for an in-process agent.
const agentTools = (user: string | undefined): ToolSet =>
	Object.fromEntries(
		Object.values(
			mergeTools(createToolsFromRoutes(router, { schemaConverter })),
		).map(({ definition, call }) => [
			definition.name,
			tool({
				description: definition.description,
				inputSchema: jsonSchema(definition.inputSchema),
				execute: async (args) => {
					const result = await call(args, { context: { user } });
					return result.structuredContent ?? result.content;
				},
			}),
		]),
	);

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
};

describe("tools from routes in an AI SDK agent", () => {
	it("runs the tool calls a model makes", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [
				{
					content: [
						{
							type: "tool-call",
							toolCallId: "1",
							toolName: "call_route",
							input: JSON.stringify({
								route: "posts_get",
								params: { id: "1" },
							}),
						},
					],
					finishReason: { unified: "tool-calls", raw: undefined },
					usage,
					warnings: [],
				},
				{
					content: [{ type: "text", text: "The post is titled Hello." }],
					finishReason: { unified: "stop", raw: undefined },
					usage,
					warnings: [],
				},
			],
		});
		const { steps } = await generateText({
			model,
			tools: agentTools(undefined),
			stopWhen: stepCountIs(2),
			prompt: "What is the title of post 1?",
		});
		expect(steps[0]!.toolResults[0]!.output).toEqual({
			id: "1",
			title: "Hello",
			body: "First post",
		});
	});
});
