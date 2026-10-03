import { type } from "@rest-rpc/core";
import {
	createOpenApiDocument,
	serverFirstRoute as route,
} from "../src/index.ts";

it("generates a document for route trees that mix declared and inferred responses", () => {
	const document = createOpenApiDocument(
		{
			declared: route
				.get("/declared")
				.output(type<string>())
				.handler(() => "ok"),
			inferred: route
				.get("/inferred")
				.handler(() => ({ status: 200, body: "ok" })),
		},
		{ info: { title: "Todos", version: "1" } },
	);

	expect(
		Object.keys(document.paths["/declared"]?.get?.responses ?? {}),
	).toEqual(["200"]);
	expect(document.paths["/inferred"]?.get?.responses).toEqual({
		default: {
			description: "Response inferred from the route handler; not documented.",
		},
	});
});
