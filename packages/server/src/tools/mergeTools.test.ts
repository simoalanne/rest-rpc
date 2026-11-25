import { route } from "../builder/routeBuilder.ts";
import { mergeTools } from "./mergeTools.ts";
import { createToolsFromRoutes } from "./toolsFromRoutes.ts";

const tools = createToolsFromRoutes({
	posts: {
		get: route
			.get("/posts/:id")
			.openAPI({ summary: "Get a post" })
			.handler(({ params }) => ({ id: params.id })),
		create: route.post("/posts").handler(() => ({ id: "2" })),
	},
});
const { findRoutes, callRoute } = mergeTools(tools);

describe("mergeTools", () => {
	it("finds routes by words of their name and description", async () => {
		const { structuredContent } = await findRoutes.call({ query: "GET post" });
		expect(structuredContent).toEqual({
			routes: [
				{ name: "posts_get", title: "Get a post", description: "Get a post" },
			],
		});
	});

	it("returns the definitions of the named routes", async () => {
		const { structuredContent } = await findRoutes.call({
			names: ["posts_get"],
		});
		expect(structuredContent).toEqual({ routes: [tools[0]!.definition] });
	});

	it("calls a route by name", async () => {
		expect(
			await callRoute.call({ route: "posts_get", params: { id: "1" } }),
		).toMatchObject({ structuredContent: { id: "1" } });
		expect(await callRoute.call({ route: "posts_missing" })).toMatchObject({
			isError: true,
		});
	});

	it("throws when two tools have the same name", () => {
		expect(() => mergeTools([tools[0]!, tools[0]!])).toThrow();
	});
});
