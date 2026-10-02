import { createRouteHandler, route, type } from "@rest-rpc/fetch";
import { withFetchServer } from "../../../tests/httpServer.ts";

it("serves a fetch-native catch-all route over HTTP", async () => {
	const handler = createRouteHandler(
		{
			create: route
				.post("/users/{id}")
				.params(type<{ id: string }>())
				.body(type<{ name: string }>())
				.handler(({ params, body, request, signal }) => {
					expect(request.method).toBe("POST");
					expect(signal).toBe(request.signal);
					return {
						status: 201,
						body: { id: params.id, name: body.name },
						responseHeaders: { "x-native": "fetch" },
					};
				}),
		},
		{ prefix: "/api" },
	);
	await withFetchServer(
		async (request) =>
			(await handler(request)).response ?? new Response(null, { status: 404 }),
		async (url) => {
			const response = await fetch(`${url}/api/users/42`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: '{"name":"Ada"}',
			});
			expect(response.status).toBe(201);
			expect(response.headers.get("x-native")).toBe("fetch");
			expect(await response.json()).toEqual({ id: "42", name: "Ada" });
			expect((await fetch(`${url}/missing`)).status).toBe(404);
		},
	);
});
