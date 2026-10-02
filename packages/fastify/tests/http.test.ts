import Fastify from "fastify";
import { registerRoutes, route, type } from "@rest-rpc/fastify";

describe("registerRoutes", () => {
	it("awaits pre-handlers and supplies the native Fastify request and reply", async () => {
		const app = Fastify();
		const calls: string[] = [];
		registerRoutes(
			app,
			{
				get: route
					.get("/users/{id}")
					.params(type<{ id: string }>())
					.handler(({ params, req, reply, signal }) => {
						calls.push("handler");
						expect(signal).toBeInstanceOf(AbortSignal);
						reply.header("x-method", req.method);
						return { status: 200, body: { id: params.id } };
					}),
			},
			{
				preHandler: [
					async (_req, _reply, declaration) => {
						await Promise.resolve();
						expect(declaration.path).toBe("/users/{id}");
						calls.push("preHandler");
					},
				],
			},
		);
		try {
			const url = await app.listen({ port: 0, host: "127.0.0.1" });
			const response = await fetch(`${url}/users/42`);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ id: "42" });
			expect(response.headers.get("x-method")).toBe("GET");
			expect(calls).toEqual(["preHandler", "handler"]);
		} finally {
			await app.close();
		}
	});

	it("lets route headers override codec headers and uses the codec content type", async () => {
		const app = Fastify();
		registerRoutes(
			app,
			{
				get: route.get("/message").handler(() => ({
					status: 200,
					body: "hello",
					responseHeaders: { "x-source": "route" },
				})),
			},
			{
				bodyCodecs: [
					{
						match: (mediaType) => mediaType === "application/json",
						serialize: (value) => ({
							body: String(value),
							contentType: "application/json; charset=utf-8",
							headers: { "x-source": "codec" },
						}),
					},
				],
			},
		);
		try {
			const url = await app.listen({ port: 0, host: "127.0.0.1" });
			const response = await fetch(`${url}/message`);
			expect(await response.text()).toBe("hello");
			expect(response.headers.get("x-source")).toBe("route");
			expect(response.headers.get("content-type")).toBe(
				"application/json; charset=utf-8",
			);
		} finally {
			await app.close();
		}
	});
});
