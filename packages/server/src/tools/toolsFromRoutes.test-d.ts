import { route } from "../builder/routeBuilder.ts";
import { createToolsFromRoutes } from "./toolsFromRoutes.ts";

describe("route tool types", () => {
	it("requires the initial context the routes require", () => {
		const tools = createToolsFromRoutes({
			me: route
				.$context<{ user: string }>()
				.get("/me")
				.handler(({ context }) => context.user),
		});
		// @ts-expect-error the routes require `context`
		void tools[0]!.call({});
		void tools[0]!.call({}, { context: { user: "ada" } });
	});

	it("makes options optional when the routes require no context", () => {
		const tools = createToolsFromRoutes({
			hello: route.get("/").handler(() => "hi"),
		});
		void tools[0]!.call({});
	});
});
