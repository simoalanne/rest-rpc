import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
	HttpRouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { route as coreRoute } from "@rest-rpc/core";
import z from "zod";
import { splitRouteImplementations } from "./splitRouteImplementations.ts";

const listRoute: HttpRouteDeclaration = coreRoute
	.get("/todos/:id")
	.response(204);

const createRoute: HttpRouteDeclaration = coreRoute
	.post("/todos/new")
	.response(204);

const socketRoute: WebSocketRouteDeclaration = coreRoute
	.ws("/todos/:id/events")
	.clientMessage("message", z.object({ action: z.string() }))
	.serverMessage("message", z.object({ id: z.string() }));

describe("splitRouteImplementations", () => {
	it("sorts and splits route implementations before calling adapter hooks", () => {
		const calls: unknown[] = [];

		splitRouteImplementations(
			{
				socket: { route: socketRoute, handler: () => undefined },
				create: { route: createRoute, handler: () => undefined },
				list: { route: listRoute, handler: () => undefined },
			},
			{
				handleHttpRoutes: (httpRoutes) => {
					calls.push({
						kind: "http",
						paths: httpRoutes.map((route) => route.route.path),
					});
				},
				handleWebSocketRoutes: (webSocketRoutes) => {
					calls.push({
						kind: "websocket",
						paths: webSocketRoutes.map((route) => route.route.path),
					});
				},
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
