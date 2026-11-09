import { type } from "@rest-rpc/core";
import { implement } from "./implement.ts";
import { route } from "./routeBuilder.ts";

declare module "./context.ts" {
	interface DefaultContext {
		requestStartedAt: number;
		tenant: string;
	}
}

describe("context types", () => {
	it("merges route context with the default context, preferring route types", () => {
		route
			.$context<{ user: string; tenant: { id: string } }>()
			.get("/")
			.handler(({ context }) => {
				expectTypeOf(context.get("requestStartedAt")).toEqualTypeOf<number>();
				expectTypeOf(context.get("user")).toEqualTypeOf<string>();
				expectTypeOf(context.get("tenant")).toEqualTypeOf<{ id: string }>();
				// @ts-expect-error Context keys must be defined.
				context.get("missing");
			});
		route.get("/").handler(({ context }) => {
			expectTypeOf(context.get("tenant")).toEqualTypeOf<string>();
		});
	});

	it("merges contract implementation context with the default context", () => {
		const contract = { get: route.get("/").response(type<string>()) };
		implement(contract)
			.$context<{ user: string }>()
			.get.handler(({ context }) => {
				expectTypeOf(context.get("requestStartedAt")).toEqualTypeOf<number>();
				expectTypeOf(context.get("user")).toEqualTypeOf<string>();
				return "ok";
			});
		implement(contract)
			.get.$context<{ user: string }>()
			.handler(({ context }) => {
				expectTypeOf(context.get("tenant")).toEqualTypeOf<string>();
				return context.get("user");
			});
	});
});
