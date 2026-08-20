import { type NextRouteMiddleware, route, router } from "@rest-rpc/next";
import { nextFixtureContract } from "./contract";

const requestContext: NextRouteMiddleware<{ request: Request }> = ({
	request,
}) => ({
	request,
});

export const targetedItemRoute = route(nextFixtureContract.targeted.get)
	.middleware(requestContext)
	.handler(({ id, context }) => ({
		id,
		title:
			context.request.headers.get("x-next-fixture-title") ?? "Targeted item",
	}));

export const nextFixtureRoutes = router(nextFixtureContract)
	.middleware(requestContext)
	.handlers({
		health: () => undefined,
		items: {
			get: ({ id, context }) => ({
				id,
				title:
					context.request.headers.get("x-next-fixture-title") ?? "Next item",
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
			get: ({ id, context }) => ({
				id,
				title:
					context.request.headers.get("x-next-fixture-title") ??
					"Targeted item",
			}),
		},
	});
