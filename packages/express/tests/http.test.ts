import express from "express";
import { withHttpServer as withServer } from "../../../tests/httpServer.ts";
import { registerRoutes, route, type } from "@rest-rpc/express";

describe("registerRoutes", () => {
	it("passes the native Express request and response after route middleware", async () => {
		const app = express();
		const calls: string[] = [];
		registerRoutes(
			app,
			{
				get: route
					.get("/users/{id}")
					.params(type<{ id: string }>())
					.handler(({ params, req, res, signal }) => {
						calls.push("handler");
						expect(signal).toBeInstanceOf(AbortSignal);
						res.setHeader("x-method", req.method);
						return { status: 200, body: { id: params.id } };
					}),
			},
			{
				middleware: [
					(_req, _res, next, declaration) => {
						expect(declaration.path).toBe("/users/{id}");
						calls.push("middleware");
						next();
					},
				],
			},
		);
		await withServer(app, async (url) => {
			const response = await fetch(`${url}/users/42`);
			expect(await response.json()).toEqual({ id: "42" });
			expect(response.headers.get("x-method")).toBe("GET");
			expect(calls).toEqual(["middleware", "handler"]);
		});
	});

	it("forwards thrown handler errors to Express error middleware", async () => {
		const app = express();
		const failure = new Error("handler failed");
		registerRoutes(app, {
			get: route
				.get("/failure")
				.response(204)
				.handler(() => {
					throw failure;
				}),
		});
		const errorHandler: express.ErrorRequestHandler = (
			error,
			_req,
			res,
			_next,
		) => {
			expect(error).toBe(failure);
			res.status(503).end();
		};
		app.use(errorHandler);
		await withServer(app, async (url) => {
			expect((await fetch(`${url}/failure`)).status).toBe(503);
		});
	});
});
