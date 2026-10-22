import { routeError, type } from "@rest-rpc/core";
import { route } from "../builder/routeBuilder.ts";
import { compileRoutes, createCatchAllHandler } from "./compileRoutes.ts";

describe("compileRoutes", () => {
	it("sends declared and undeclared errors and reports them to onError", async () => {
		const Gone = routeError("GONE", { status: 410 });
		const onError = vi.fn();
		const [declared, undeclared] = compileRoutes(
			{
				declared: route
					.get("/declared")
					.error(Gone)
					.handler((): string => {
						throw new Gone();
					}),
				undeclared: route.get("/undeclared").handler((): string => {
					throw new Gone();
				}),
			},
			{ onError },
		);
		const request = new Request("http://localhost/declared");
		expect((await declared!.handle(request)).status).toBe(410);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ code: "GONE", status: 410 }),
			request,
		);
		const response = await undeclared!.handle(
			new Request("http://localhost/undeclared"),
		);
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
