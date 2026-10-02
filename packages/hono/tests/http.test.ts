import { Hono } from "hono";
import { registerRoutes, route, type } from "@rest-rpc/hono";
import { withFetchServer } from "../../../tests/httpServer.ts";

describe("registerRoutes", () => {
	it("passes the Hono context and matched route through middleware to the handler", async () => {
		const app = new Hono();
		const calls: string[] = [];
		const get = route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.handler(({ params, c, signal }) => {
				calls.push("handler");
				expect(signal).toBe(c.req.raw.signal);
				return {
					status: 200,
					body: { id: params.id, header: c.req.header("x-name") },
				};
			});
		registerRoutes(
			app,
			{ get },
			{
				middleware: [
					async (_c, next, declaration) => {
						expect(declaration.path).toBe("/users/{id}");
						calls.push("middleware");
						await next();
					},
				],
			},
		);
		await withFetchServer(
			(request) => app.fetch(request),
			async (url) => {
				const response = await fetch(`${url}/users/42`, {
					headers: { "x-name": "Ada" },
				});
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual({ id: "42", header: "Ada" });
				expect(calls).toEqual(["middleware", "handler"]);
			},
		);
	});

	it("applies the body limit before invoking the route handler", async () => {
		const app = new Hono();
		const handler = vi.fn(() => ({ status: 204 as const }));
		registerRoutes(
			app,
			{
				post: route
					.post("/message")
					.body(type<string>(), { contentType: "text/plain" })
					.handler(handler),
			},
			{ requestBodyLimit: 3 },
		);
		await withFetchServer(
			(request) => app.fetch(request),
			async (url) => {
				expect(
					(
						await fetch(`${url}/message`, {
							method: "POST",
							headers: { "content-type": "text/plain" },
							body: "abcd",
						})
					).status,
				).toBe(413);
				expect(handler).not.toHaveBeenCalled();
				expect(
					(
						await fetch(`${url}/message`, {
							method: "POST",
							headers: { "content-type": "text/plain" },
							body: "abc",
						})
					).status,
				).toBe(204);
			},
		);
	});
});
