import { type } from "@rest-rpc/core";
import { serverFirstRoute as route } from "./routeBuilder.ts";

describe("routeBuilder types", () => {
	it("checks declared response statuses and bodies", () => {
		const declared = route.get("/").response(200, type<{ id: string }>());
		declared.handler(() => ({ status: 200, body: { id: "ok" } }));
		// @ts-expect-error The route only declares status 200.
		declared.handler(() => ({ status: 404, body: { id: "missing" } }));
		// @ts-expect-error The declared body requires a string id.
		declared.handler(() => ({ status: 200, body: { id: 1 } }));
	});

	it("limits context access and writes to declared keys and values", () => {
		route.$context<{ count: number }>().handler(({ context }) => {
			context.set("count", 1);
			expectTypeOf(context.get("count")).toEqualTypeOf<number>();
			// @ts-expect-error Context keys must be declared.
			context.get("missing");
			// @ts-expect-error Context values must match their key.
			context.set("count", "1");
			return "ok";
		});
	});
});
