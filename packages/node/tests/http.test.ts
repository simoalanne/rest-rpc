import { createRouteHandler, route, type } from "@rest-rpc/node";
import { withHttpServer } from "../../../tests/httpServer.ts";

it("serves parsed Node requests over HTTP and leaves unmatched requests to the host", async () => {
	const handler = createRouteHandler(
		{
			create: route
				.post("/users/{id}")
				.params(type<{ id: string }>())
				.body(type<{ name: string }>())
				.handler(({ params, body, req, res, signal }) => {
					expect(signal).toBeInstanceOf(AbortSignal);
					expect(req.method).toBe("POST");
					res.setHeader("x-native", "node");
					return { status: 201, body: { id: params.id, name: body.name } };
				}),
		},
		{ prefix: "/api" },
	);
	await withHttpServer(
		async (req, res) => {
			if (!(await handler(req, res)).matched) {
				res.statusCode = 404;
				res.end();
			}
		},
		async (url) => {
			const response = await fetch(`${url}/api/users/42`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: '{"name":"Ada"}',
			});
			expect(response.status).toBe(201);
			expect(response.headers.get("x-native")).toBe("node");
			expect(await response.json()).toEqual({ id: "42", name: "Ada" });
			expect((await fetch(`${url}/missing`)).status).toBe(404);
		},
	);
});
