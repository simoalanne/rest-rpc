import type { NextRouteHandlerContext } from "@rest-rpc/next";
import type { RouteHandler } from "@rest-rpc/web";
import type { nextFixtureContract } from "./contract";

export const getTargetedItem: RouteHandler<
	typeof nextFixtureContract.targeted.get,
	NextRouteHandlerContext
> = ({ id, context }) => ({
	id,
	title: context.request.headers.get("x-next-fixture-title") ?? "Targeted item",
});

export const nextFixtureHandlers = {
	health: () => undefined,
	items: {
		get: ({ id, context }) => ({
			id,
			title: context.request.headers.get("x-next-fixture-title") ?? "Next item",
		}),
		create: ({ title }) => ({
			status: 201,
			body: {
				id: "created-next-item",
				title,
			},
		}),
	},
	targeted: {
		get: getTargetedItem,
	},
} satisfies Parameters<
	typeof import("@rest-rpc/next").createRouterHandler<
		typeof nextFixtureContract
	>
>[1];
