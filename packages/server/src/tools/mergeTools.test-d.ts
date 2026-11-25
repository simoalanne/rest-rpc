import { route } from "../builder/routeBuilder.ts";
import { mergeTools } from "./mergeTools.ts";
import { createToolsFromRoutes, type AgentTool } from "./toolsFromRoutes.ts";

describe("merged tool types", () => {
	it("requires context only to call routes", () => {
		const tools = createToolsFromRoutes({
			me: route
				.$context<{ user: string }>()
				.get("/me")
				.handler(({ context }) => context.user),
		});
		const { findRoutes, callRoute } = mergeTools(tools);

		void findRoutes.call({});
		// @ts-expect-error the routes require `context`
		void callRoute.call({});
		void callRoute.call({}, { context: { user: "ada" } });

		const agentTools: AgentTool<{ user: string }>[] = [findRoutes, callRoute];
		void agentTools;
	});
});
