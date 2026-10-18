import { route, type } from "@rest-rpc/core";
import { implement } from "./implement.ts";
import type { ContractImplementer } from "./implement.types.ts";
import type { RouteHandler, RouteRequest } from "./routeBuilder.types.ts";

const contract = {
	users: {
		get: route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(type<{ name: string }>()),
	},
};

const transformed = route
	.get("/users/{id}")
	.params(type((value: { id: string }) => ({ id: Number(value.id) })))
	.response(type<string>());
const transformedContract = { users: { get: transformed } };

type Values = { requestId: string };
declare const implementation: ContractImplementer<
	typeof transformedContract,
	Values
>;

describe("implement types", () => {
	it("should infer route inputs, context, and implementation shape", () => {
		const implementation = implement(contract).$context<{
			requestId: string;
		}>();

		implementation.users.get.handler((request) => {
			expectTypeOf(request.params).toEqualTypeOf<{ id: string }>();
			expectTypeOf(request.context.get("requestId")).toEqualTypeOf<string>();

			return { status: 200, body: { name: "Ada" } };
		});
	});

	it("passes handler fields and transformed requests through middleware", () => {
		implementation
			.use(({ signal, context, next }) => {
				expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
				context.set("requestId", "1");
				return next();
			})
			.users.get.use(({ params, next }) => {
				expectTypeOf(params.id).toEqualTypeOf<number>();
				return next();
			})
			.handler((request) => {
				expectTypeOf(request).toEqualTypeOf<
					RouteRequest<(typeof transformed)["~restrpc"], Values>
				>();
				return { status: 200, body: request.context.get("requestId") };
			});
	});

	it("accepts separately typed handlers and replaces context", () => {
		const handler: RouteHandler<(typeof transformed)["~restrpc"], Values> = ({
			params,
		}) => ({ status: 200, body: String(params.id) });
		implementation.users.get.handler(handler);
		implementation
			.$context<{ count: number }>()
			.users.get.handler(({ context }) => {
				expectTypeOf(context.get("count")).toEqualTypeOf<number>();
				// @ts-expect-error Replacing context removes its previous keys.
				context.get("requestId");
				return { status: 200, body: "ok" };
			});
	});
});
