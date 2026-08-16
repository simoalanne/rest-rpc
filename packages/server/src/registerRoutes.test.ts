import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
	HttpRouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { noBody } from "@rest-rpc/core/contract";
import z from "zod";
import { registerRoutes } from "./registerRoutes.ts";

const listRoute: HttpRouteDeclaration = {
	method: "GET",
	path: "/todos/:id",
	responses: {
		204: noBody(),
	},
};

const createRoute: HttpRouteDeclaration = {
	method: "POST",
	path: "/todos/new",
	responses: {
		204: noBody(),
	},
};

const socketRoute: WebSocketRouteDeclaration = {
	method: "GET",
	path: "/todos/:id/events",
	mode: "webSocket",
	messages: {
		client: z.object({ action: z.string() }),
		server: z.object({ id: z.string() }),
	},
};

describe("registerRoutes", () => {
	it("sorts and splits route implementations before calling adapter hooks", () => {
		const calls: unknown[] = [];

		registerRoutes(
			{
				socket: { route: socketRoute, handler: () => undefined },
				create: { route: createRoute, handler: () => undefined },
				list: { route: listRoute, handler: () => undefined },
			},
			(routes) => {
				calls.push({
					kind: "http",
					paths: routes.map((route) => route.route.path),
				});
			},
			(routes) => {
				calls.push({
					kind: "websocket",
					paths: routes.map((route) => route.route.path),
				});
			},
		);

		assert.deepEqual(calls, [
			{
				kind: "http",
				paths: ["/todos/new", "/todos/:id"],
			},
			{
				kind: "websocket",
				paths: ["/todos/:id/events"],
			},
		]);
	});
});
