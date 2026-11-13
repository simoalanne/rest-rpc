import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { route } from "../builder/routeBuilder.ts";
import { compileRoutes } from "./compileRoutes.ts";
import { createApp } from "./createApp.ts";

const schema = (
	validate: StandardSchemaV1["~standard"]["validate"],
): StandardSchemaV1 => ({
	"~standard": { version: 1, vendor: "test", validate },
});

describe("static routes", () => {
	it("throws invalid and async responses when the routes are compiled", () => {
		const invalid = route
			.get("/invalid")
			.response(schema(() => ({ issues: [{ message: "invalid" }] })))
			.static({ id: 1 });
		expect(() => compileRoutes({ invalid })).toThrow("is invalid");
		const async = route
			.get("/async")
			.response(schema(async (value) => ({ value })))
			.static({ id: 1 });
		expect(() => compileRoutes({ async })).toThrow("synchronously");
	});

	it("rejects routes with middleware that bypass the types", () => {
		const builder = route
			.use(({ next }) => next())
			.get("/items") as unknown as {
			static(value: unknown): never;
		};
		expect(() => compileRoutes({ item: builder.static(1) })).toThrow(
			"cannot have middleware",
		);
	});

	it("is a Response in app routes and does not call the context function", async () => {
		const context = vi.fn(() => ({}));
		const app = createApp(
			{ health: route.get("/health").static({ ok: true }) },
			{ context },
		);
		expect(app.routes["/health"]!.GET).toBeInstanceOf(Response);
		await app.fetch(new Request("http://localhost/health"));
		expect(context).not.toHaveBeenCalled();
	});
});
