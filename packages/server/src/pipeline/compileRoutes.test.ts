import { routeError, type } from "@rest-rpc/core";
import { route } from "../builder/routeBuilder.ts";
import { compileRoutes, createCatchAllHandler } from "./compileRoutes.ts";

describe("compileRoutes", () => {
	it("sends defined and other errors and reports them to onError", async () => {
		const Gone = routeError("GONE", { status: 410 });
		const onError = vi.fn();
		const [defined, other] = compileRoutes(
			{
				defined: route
					.get("/defined")
					.error(Gone)
					.handler((): string => {
						throw new Gone();
					}),
				other: route.get("/other").handler((): string => {
					throw new Gone();
				}),
			},
			{ onError },
		);
		const request = new Request("http://localhost/defined");
		expect((await defined!.handle(request)).status).toBe(410);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ code: "GONE", status: 410 }),
			request,
		);
		const response = await other!.handle(new Request("http://localhost/other"));
		expect(response.status).toBe(410);
		expect(await response.json()).toEqual({ code: "GONE", message: "GONE" });
		expect(onError).toHaveBeenCalledTimes(2);
	});
});

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
