import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { router as defineRouter } from "@contract-first-api/core/contract";
import type { Application, Request, Response } from "express";
import z from "zod";
import { router } from "../server/router.ts";
import { registerRoutes } from "./registerRoutes.ts";

type RegisteredHandler = (req: Request, res: Response) => Promise<void>;

const createAppMock = () => {
	let handler: RegisteredHandler | undefined;
	const app = {
		post: (_path: string, registered: RegisteredHandler) => {
			handler = registered;
		},
	} as unknown as Application;

	return {
		app,
		handler: () => {
			assert(handler);
			return handler;
		},
	};
};

const createResponseMock = () => {
	const state = {
		statusCode: 200,
		body: undefined as unknown,
		headers: {} as Record<string, unknown>,
	};

	const res = {
		status(statusCode: number) {
			state.statusCode = statusCode;
			return res;
		},
		json(body: unknown) {
			state.body = body;
			return res;
		},
		setHeader(name: string, value: unknown) {
			state.headers[name] = value;
		},
	} as unknown as Response;

	return { res, state };
};

describe("registerRoutes", () => {
	it("sends transformed response output", async () => {
		const api = defineRouter({
			todos: {
				create: {
					method: "POST",
					path: "/todos",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						201: z.object({ id: z.number() }).transform(({ id }) => ({
							id: String(id),
						})),
					},
				},
			},
		});
		const { app, handler } = createAppMock();
		registerRoutes(
			app,
			router(api, {
				todos: {
					create: () => ({
						status: 201,
						body: {
							id: 123,
						},
					}),
				},
			}),
		);
		const { res, state } = createResponseMock();

		await handler()(
			{
				body: { title: "Write tests" },
				query: {},
				params: {},
				headers: {},
			} as Request,
			res,
		);

		assert.equal(state.statusCode, 201);
		assert.deepEqual(state.body, { id: "123" });
	});
});
