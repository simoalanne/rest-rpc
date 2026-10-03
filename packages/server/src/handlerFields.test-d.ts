import { route as contractRoute, type } from "@rest-rpc/core";
import type {
	Contractimplementer,
	RouteHandler,
	RouteHandlerFor,
	RouteRequest,
	ServerRouteBuilder,
} from "./index.ts";

type Fields = { native: { method: string }; signal: AbortSignal };
type Values = { requestId: string };
declare const route: ServerRouteBuilder<Fields, Values>;
const declaration = contractRoute
	.get("/users/{id}")
	.params(type((value: { id: string }) => ({ id: Number(value.id) })))
	.response(200, type<string>());
const contract = { users: { get: declaration } };
declare const implementation: Contractimplementer<
	typeof contract,
	Fields,
	Values
>;

describe("server handler generic propagation", () => {
	it("retains native fields and context through root and route middleware", () => {
		const middleware = route.middleware(({ native, signal, context, next }) => {
			expectTypeOf(native).toEqualTypeOf<Fields["native"]>();
			expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
			expectTypeOf(context.get("requestId")).toEqualTypeOf<string>();
			return next();
		});
		route
			.use(middleware)
			.get("/")
			.params(type<{ id: string }>())
			.use(({ params, native, context, next }) => {
				expectTypeOf(params).toEqualTypeOf<{ id: string }>();
				expectTypeOf(native.method).toEqualTypeOf<string>();
				context.set("requestId", native.method);
				return next();
			})
			.handler(({ native, signal, context }) => {
				expectTypeOf(native).toEqualTypeOf<Fields["native"]>();
				expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
				return context.get("requestId");
			});
	});

	it("retains fields and transformed requests through contract implementers", () => {
		implementation
			.use(({ native, context, next }) => {
				context.set("requestId", native.method);
				return next();
			})
			.users.get.use(({ params, signal, next }) => {
				expectTypeOf(params.id).toEqualTypeOf<number>();
				expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
				return next();
			})
			.handler((request) => {
				expectTypeOf(request).toEqualTypeOf<
					RouteRequest<(typeof declaration)["~restrpc"], Fields, Values>
				>();
				return { status: 200, body: request.context.get("requestId") };
			});
		const handler: RouteHandler<
			(typeof declaration)["~restrpc"],
			Fields,
			Values
		> = ({ native }) => ({ status: 200, body: native.method });
		implementation.users.get.handler(handler);
		implementation
			.$context<{ count: number }>()
			.users.get.handler(({ native, context }) => {
				expectTypeOf(native).toEqualTypeOf<Fields["native"]>();
				expectTypeOf(context.get("count")).toEqualTypeOf<number>();
				// @ts-expect-error Replacing context removes its previous keys.
				context.get("requestId");
				return { status: 200, body: "ok" };
			});
	});

	it("infers handler signatures for a route tree", () => {
		const tree = { users: { get: declaration } };
		expectTypeOf<
			RouteHandlerFor<typeof tree, Fields, Values>["users"]["get"]
		>().toEqualTypeOf<
			RouteHandler<(typeof declaration)["~restrpc"], Fields, Values>
		>();
	});

	it("returns plain values from handlers of plain output routes", () => {
		const output = contractRoute.get("/").output(type<string>());
		type Handler = RouteHandlerFor<typeof output, Fields, Values>;
		expectTypeOf<ReturnType<Handler>>().toEqualTypeOf<
			string | Promise<string>
		>();
	});
});
