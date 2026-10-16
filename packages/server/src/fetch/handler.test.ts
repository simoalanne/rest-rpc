import { compileRoutes, createCatchAllHandler } from "./handler.ts";
import { route, type, type Context } from "./index.ts";

describe("handler", () => {
	it("dispatches prefixed routes with parsed input and the request signal", async () => {
		const request = new Request("http://localhost/api/users/42", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Ada" }),
		});
		const handler = createCatchAllHandler(
			compileRoutes(
				{
					user: route
						.post("/users/{id}")
						.params(type<{ id: string }>())
						.body(type<{ name: string }>())
						.handler((input) => {
							expect(input.signal).toBe(request.signal);
							return {
								status: 201,
								body: { id: input.params.id, ...input.body },
							};
						}),
				},
				{ prefix: "/api" },
			),
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
		const handler = createCatchAllHandler(
			compileRoutes({
				get: route.get("/users").handler(() => ({ status: 204 })),
			}),
		);
		expect(await handler(request)).toEqual({
			matched: false,
			response: undefined,
		});
		expect(request.bodyUsed).toBe(false);
	});

	it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid requestBodyLimit %s at construction",
		(requestBodyLimit) => {
			expect(() =>
				createCatchAllHandler(compileRoutes({}, { requestBodyLimit })),
			).toThrow("requestBodyLimit must be a positive safe integer");
		},
	);

	it("returns body parsing rejections without invoking the route", async () => {
		const callback = vi.fn(() => ({ status: 204 as const }));
		const handler = createCatchAllHandler(
			compileRoutes({
				post: route.post("/users").body(type<unknown>()).handler(callback),
			}),
		);
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

	it("compiles routes that read params from the URL and accept seeded context", async () => {
		const [user] = compileRoutes(
			{
				user: route
					.get("/users/{id}")
					.params(type<{ id: string }>())
					.handler(({ params, context }) => ({
						status: 200,
						body: {
							id: params.id,
							user: (context as unknown as Context<{ user: string }>).get(
								"user",
							),
						},
					})),
			},
			{ prefix: "/api", paramSyntax: "colon" },
		);
		expect(user).toMatchObject({ method: "GET", path: "/api/users/:id" });
		const response = await user!.handle(
			new Request("http://localhost/api/users/a%20b"),
			{ context: { user: "ada" } as never },
		);
		expect(await response.json()).toEqual({ id: "a b", user: "ada" });
		await expect(
			user!.handle(new Request("http://localhost/other")),
		).rejects.toThrow('does not match route "GET /api/users/:id"');
	});

	it("keeps declared param markers when no param syntax is given", () => {
		const [user] = compileRoutes({
			user: route.get("/users/{id}").handler(() => ({ status: 204 })),
		});
		expect(user?.path).toBe("/users/{id}");
	});
});
