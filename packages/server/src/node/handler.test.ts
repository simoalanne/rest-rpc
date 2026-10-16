import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { compileRoutes, createCatchAllHandler } from "./handler.ts";
import { route, type, type Context } from "./index.ts";

const setup = (url: string) => {
	const request = new IncomingMessage(new Socket());
	request.url = url;
	request.method = "GET";
	const response = new ServerResponse(request);
	const end = vi.spyOn(response, "end").mockReturnValue(response);
	return { request, response, end };
};

describe("handler", () => {
	it("dispatches a route with the request signal and writes its response", async () => {
		const { request, response, end } = setup("/api/users/42");
		const handler = createCatchAllHandler(
			compileRoutes(
				{
					user: route
						.get("/users/{id}")
						.params(type<{ id: string }>())
						.handler((input) => {
							expect(input.signal.aborted).toBe(false);
							return { status: 200, body: { id: input.params.id } };
						}),
				},
				{ prefix: "/api" },
			),
		);
		expect(await handler(request, response)).toEqual({ matched: true });
		expect(response.getHeader("content-type")).toBe("application/json");
		expect(end).toHaveBeenCalledWith(Buffer.from('{"id":"42"}'));
	});

	it("leaves unmatched responses untouched", async () => {
		const { request, response, end } = setup("/missing");
		expect(
			await createCatchAllHandler(compileRoutes({}))(request, response),
		).toEqual({
			matched: false,
		});
		expect(end).not.toHaveBeenCalled();
		expect(response.getHeaderNames()).toEqual([]);
	});

	it("does not write to a response destroyed during the handler", async () => {
		const { request, response, end } = setup("/users");
		const handler = createCatchAllHandler(
			compileRoutes({
				users: route.get("/users").handler(() => {
					response.destroyed = true;
					return { status: 204 };
				}),
			}),
		);
		expect(await handler(request, response)).toEqual({ matched: true });
		expect(end).not.toHaveBeenCalled();
	});

	it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid requestBodyLimit %s at construction",
		(requestBodyLimit) => {
			expect(() =>
				createCatchAllHandler(compileRoutes({}, { requestBodyLimit })),
			).toThrow("requestBodyLimit must be a positive safe integer");
		},
	);

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
		const { request, response, end } = setup("/api/users/a%20b");
		await user!.handle(request, response, {
			context: { user: "ada" } as never,
		});
		expect(end).toHaveBeenCalledWith(Buffer.from('{"id":"a b","user":"ada"}'));
		const other = setup("/other");
		await expect(user!.handle(other.request, other.response)).rejects.toThrow(
			'does not match route "GET /api/users/:id"',
		);
	});
});
