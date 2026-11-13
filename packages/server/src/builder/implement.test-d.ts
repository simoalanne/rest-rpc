import { route, type } from "@rest-rpc/core";
import type { DefaultContext, ExtendContext } from "./context.ts";
import { implement } from "./implement.ts";
import { respond } from "../pipeline/respond.ts";
import type { ContractImplementer } from "./implement.types.ts";
import type {
	InferServerHandler,
	InferServerRequest,
	RouteHandler,
	RouteRequest,
} from "./routeBuilder.types.ts";

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
			expectTypeOf(request.context.requestId).toEqualTypeOf<string>();

			return respond({ name: "Ada" });
		});
	});

	it("passes handler fields and transformed requests through middleware", () => {
		implementation
			.use(({ signal, context, next }) => {
				expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
				expectTypeOf(context.requestId).toEqualTypeOf<string>();
				return next({ context: { tenant: "t" } });
			})
			.users.get.use(({ params, context, next }) => {
				expectTypeOf(params.id).toEqualTypeOf<number>();
				expectTypeOf(context.tenant).toEqualTypeOf<string>();
				return next();
			})
			.handler((request) => {
				expectTypeOf(request).toEqualTypeOf<
					RouteRequest<
						(typeof transformed)["~restrpc"],
						{ requestId: string; tenant: string }
					>
				>();
				return respond(request.context.requestId);
			});
	});

	it("accepts separately typed handlers and extends context", () => {
		const handler: RouteHandler<(typeof transformed)["~restrpc"], Values> = ({
			params,
		}) => respond(String(params.id));
		implementation.users.get.handler(handler);
		implementation
			.$context<{ count: number }>()
			.users.get.$context<{ requestId: "1" }>()
			.handler(({ context }) => {
				expectTypeOf(context.count).toEqualTypeOf<number>();
				expectTypeOf(context.requestId).toEqualTypeOf<"1">();
				// @ts-expect-error Context keys must be declared or injected.
				void context.missing;
				return respond("ok");
			});
	});

	it("infers the selected context from implementer routes and trees", () => {
		const implementation = implement(contract).$context<Values>();
		expectTypeOf<
			InferServerRequest<typeof implementation.users.get>["context"]
		>().toEqualTypeOf<Readonly<ExtendContext<DefaultContext, Values>>>();
		type Handlers = InferServerHandler<typeof implementation>;
		expectTypeOf<keyof Handlers>().toEqualTypeOf<"users">();
		expectTypeOf<
			InferServerRequest<typeof implementation>["users"]["get"]["context"]
		>().toEqualTypeOf<Readonly<ExtendContext<DefaultContext, Values>>>();
		const leaf = implement(contract).users.get.$context<{ count: number }>();
		expectTypeOf<InferServerRequest<typeof leaf>["context"]>().toEqualTypeOf<
			Readonly<ExtendContext<DefaultContext, { count: number }>>
		>();
	});

	it("offers static() on contract routes without request input or middleware", () => {
		const api = {
			health: route.get("/health").response(type<{ ok: boolean }>()),
			users: contract.users,
		};
		implement(api).health.static({ ok: true });
		// @ts-expect-error The contract route has params.
		implement(api).users.get.static({ name: "Ada" });
		const leaf = implement(api).health.use(({ next }) => next());
		// @ts-expect-error The leaf runs middleware.
		leaf.static({ ok: true });
		const tree = implement(api).use(({ next }) => next());
		// @ts-expect-error The tree runs middleware.
		tree.health.static({ ok: true });
	});
});
