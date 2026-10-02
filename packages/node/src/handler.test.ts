import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { createRouteHandler } from "./handler.ts";
import { route, type } from "./index.ts";

const setup = (url: string) => {
	const request = new IncomingMessage(new Socket());
	request.url = url;
	request.method = "GET";
	const response = new ServerResponse(request);
	const end = vi.spyOn(response, "end").mockReturnValue(response);
	return { request, response, end };
};

describe("handler", () => {
	it("dispatches a route with native Node fields and writes its response", async () => {
		const { request, response, end } = setup("/api/users/42");
		const handler = createRouteHandler(
			{
				user: route
					.get("/users/{id}")
					.params(type<{ id: string }>())
					.handler((input) => {
						expect(input.req).toBe(request);
						expect(input.res).toBe(response);
						expect(input.signal.aborted).toBe(false);
						return { status: 200, body: { id: input.params.id } };
					}),
			},
			{ prefix: "/api" },
		);
		expect(await handler(request, response)).toEqual({ matched: true });
		expect(response.getHeader("content-type")).toBe("application/json");
		expect(end).toHaveBeenCalledWith(Buffer.from('{"id":"42"}'));
	});

	it("leaves unmatched responses untouched", async () => {
		const { request, response, end } = setup("/missing");
		expect(await createRouteHandler({})(request, response)).toEqual({
			matched: false,
		});
		expect(end).not.toHaveBeenCalled();
		expect(response.getHeaderNames()).toEqual([]);
	});

	it("does not write to a response destroyed during the handler", async () => {
		const { request, response, end } = setup("/users");
		const handler = createRouteHandler({
			users: route.get("/users").handler(({ res }) => {
				res.destroyed = true;
				return { status: 204 };
			}),
		});
		expect(await handler(request, response)).toEqual({ matched: true });
		expect(end).not.toHaveBeenCalled();
	});

	it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid requestBodyLimit %s at construction",
		(requestBodyLimit) => {
			expect(() => createRouteHandler({}, { requestBodyLimit })).toThrow(
				"requestBodyLimit must be a positive safe integer",
			);
		},
	);
});
