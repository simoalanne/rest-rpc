import { createRouteHandler } from "./handler.ts";
import { route, type } from "./index.ts";

describe("handler", () => {
	it("dispatches prefixed routes with parsed input and the native request", async () => {
		const request = new Request("http://localhost/api/users/42", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Ada" }),
		});
		const handler = createRouteHandler(
			{
				user: route
					.post("/users/{id}")
					.params(type<{ id: string }>())
					.body(type<{ name: string }>())
					.handler((input) => {
						expect(input.request).toBe(request);
						expect(input.signal).toBe(request.signal);
						return {
							status: 201,
							body: { id: input.params.id, ...input.body },
						};
					}),
			},
			{ prefix: "/api" },
		);
		const result = await handler(request);
		expect(result.matched).toBe(true);
		expect(result.response?.status).toBe(201);
		expect(await result.response?.json()).toEqual({ id: "42", name: "Ada" });
	});

	it("returns unmatched requests to the caller without consuming them", async () => {
		const request = new Request("http://localhost/missing", {
			method: "POST",
			body: "input",
		});
		const handler = createRouteHandler({
			get: route.get("/users").handler(() => ({ status: 204 })),
		});
		expect(await handler(request)).toEqual({
			matched: false,
			response: undefined,
		});
		expect(request.bodyUsed).toBe(false);
	});

	it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid requestBodyLimit %s at construction",
		(requestBodyLimit) => {
			expect(() => createRouteHandler({}, { requestBodyLimit })).toThrow(
				"requestBodyLimit must be a positive safe integer",
			);
		},
	);

	it("returns body parsing rejections without invoking the route", async () => {
		const callback = vi.fn(() => ({ status: 204 as const }));
		const handler = createRouteHandler({
			post: route.post("/users").body(type<unknown>()).handler(callback),
		});
		const result = await handler(
			new Request("http://localhost/users", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
		);
		expect(result.response?.status).toBe(400);
		expect(callback).not.toHaveBeenCalled();
	});
});
