import { route } from "../builder/routeBuilder.ts";
import { mergeTools } from "./mergeTools.ts";
import { createToolsFromRoutes } from "./toolsFromRoutes.ts";

describe("route tool types", () => {
	it("requires the initial context the routes require", () => {
		const tools = createToolsFromRoutes({
			me: route
				.$context<{ user: string }>()
				.get("/me")
				.handler(({ context }) => context.user),
		});
		const { findRoutes: find } = mergeTools(tools);

		// @ts-expect-error the routes require `context`
		void tools[0]!.call({});
		// @ts-expect-error merged tools take the options of the tools they merge
		void find.call({});
		void tools[0]!.call({}, { context: { user: "ada" } });
		void find.call({}, { context: { user: "ada" } });
	});

	it("makes options optional when the routes require no context", () => {
		const tools = createToolsFromRoutes({
			hello: route.get("/").handler(() => "hi"),
		});
		void tools[0]!.call({});
	});
});
