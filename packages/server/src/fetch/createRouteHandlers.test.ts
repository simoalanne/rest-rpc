import { routeError, type } from "@rest-rpc/core";
import { route } from "../builder/routeBuilder.ts";
import {
	createRouteHandlers,
	createCatchAllHandler,
} from "./createRouteHandlers.ts";

describe("createRouteHandlers", () => {
	it("orders static segments before params for routers that match in order", () => {
		const paths = [
			"/:group/:id/edit",
			"/users/:id/edit",
			"/users/me/:action",
			"/users/me/edit",
		] as const;
		const tree = Object.fromEntries(
			paths.map((path) => [path, route.get(path).handler(() => path)]),
		);
		expect(createRouteHandlers(tree).map(({ path }) => path)).toEqual(
			[...paths].reverse(),
		);
	});

	it("sends defined and other route errors", async () => {
		const Gone = routeError("GONE", { status: 410 });
		const [defined, other] = createRouteHandlers({
			defined: route
				.get("/defined")
				.error(Gone)
				.handler((): string => {
					throw new Gone();
				}),
			other: route.get("/other").handler((): string => {
				throw new Gone();
			}),
		});
		const request = new Request("http://localhost/defined");
		expect((await defined!.handle(request)).status).toBe(410);
		const response = await other!.handle(new Request("http://localhost/other"));
		expect(response.status).toBe(410);
		expect(await response.json()).toEqual({ code: "GONE", message: "GONE" });
	});
});

describe("createCatchAllHandler", () => {
	it("passes its decoded matched params instead of params attached by another router", async () => {
		const handler = createCatchAllHandler({
			user: route
				.get("/users/:id")
				.params(type<{ id: string }>())
				.handler(({ params }) => params.id),
		});
		// A router that mounted the catch-all at `/:id/*` attached its own params.
		const request = Object.assign(new Request("http://localhost/users/a%20b"), {
			params: { id: "mount" },
		});
		const result = await handler(request);
		expect(await result.response?.json()).toBe("a b");
	});
});
