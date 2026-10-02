import { route as contractRoute, type } from "@rest-rpc/core";
import type {
	Contractimplementer,
	RouteHandler,
	RouteErrors,
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
	it("derives handler errors from declared non-2xx responses", () => {
		const declaration = contractRoute
			.get("/")
			.response(200, type<string>())
			.response(
				404,
				type((message: string) => ({ message })),
			)
			.response(503, type<{ retry: boolean }>());
		expectTypeOf<RouteErrors<typeof declaration>>().toEqualTypeOf<
			{ status: 404; body: string } | { status: 503; body: { retry: boolean } }
		>();
		expectTypeOf<
			RouteErrors<typeof contract.users.get>
		>().toEqualTypeOf<never>();
	});

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
});
