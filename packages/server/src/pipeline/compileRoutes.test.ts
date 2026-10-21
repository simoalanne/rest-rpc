import { type } from "@rest-rpc/core";
import { route } from "../builder/routeBuilder.ts";
import { compileRoutes, createCatchAllHandler } from "./compileRoutes.ts";

describe("createCatchAllHandler", () => {
	it("passes its decoded matched params instead of params attached by another router", async () => {
		const handler = createCatchAllHandler(
			compileRoutes({
				user: route
					.get("/users/:id")
					.params(type<{ id: string }>())
					.handler(({ params }) => params.id),
			}),
		);
		// A router that mounted the catch-all at `/:id/*` attached its own params.
		const request = Object.assign(new Request("http://localhost/users/a%20b"), {
			params: { id: "mount" },
		});
		const result = await handler(request);
		expect(await result.response?.json()).toBe("a b");
	});
});
