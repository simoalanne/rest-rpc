import {
	route as contractRoute,
	type,
	type InferClientResponse,
	type InferServerResponse,
} from "@rest-rpc/core";
import { sse } from "../pipeline/sse.ts";
import { route } from "./routeBuilder.ts";
import type {
	ImplicitResponseKind,
	RouteHandler,
	RouteHandlerFor,
} from "./routeBuilder.types.ts";

type Values = { requestId: string };
const fieldRoute = route.$context<Values>();

describe("routeBuilder types", () => {
	it("checks declared response statuses and bodies", () => {
		const declared = route.get("/").response(type<{ id: string }>());
		declared.handler(() => ({ status: 200, body: { id: "ok" } }));
		// @ts-expect-error The route only declares status 200.
		declared.handler(() => ({ status: 404, body: { id: "missing" } }));
		// @ts-expect-error The declared body requires a string id.
		declared.handler(() => ({ status: 200, body: { id: 1 } }));
	});

	it("limits context access and writes to declared keys and values", () => {
		route.$context<{ count: number }>().handler(({ context }) => {
			context.set("count", 1);
			expectTypeOf(context.get("count")).toEqualTypeOf<number>();
			// @ts-expect-error Context keys must be declared.
			context.get("missing");
			// @ts-expect-error Context values must match their key.
			context.set("count", "1");
			return "ok";
		});
	});

	it("passes handler fields and context through middleware to the handler", () => {
		const middleware = fieldRoute.middleware(({ signal, context, next }) => {
			expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
			expectTypeOf(context.get("requestId")).toEqualTypeOf<string>();
			return next();
		});
		fieldRoute
			.use(middleware)
			.get("/")
			.params(type<{ id: string }>())
			.use(({ params, context, next }) => {
				expectTypeOf(params).toEqualTypeOf<{ id: string }>();
				context.set("requestId", params.id);
				return next();
			})
			.handler(({ signal, context }) => {
				expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
				return context.get("requestId");
			});
	});

	it("infers handler signatures for a route tree", () => {
		const declaration = contractRoute.get("/").response(type<string>());
		const tree = { users: { get: declaration } };
		expectTypeOf<
			RouteHandlerFor<typeof tree, Values>["users"]["get"]
		>().toEqualTypeOf<RouteHandler<(typeof declaration)["~restrpc"], Values>>();
	});

	it("returns envelopes or the body of a single declared response", () => {
		const declared = contractRoute.get("/").response(type<string>());
		type Handler = RouteHandlerFor<typeof declared, Values>;
		expectTypeOf<ReturnType<Handler>>().toEqualTypeOf<
			| { status: 200; body: string }
			| string
			| Promise<{ status: 200; body: string } | string>
		>();
		const created = contractRoute
			.post("/")
			.response(type<string>(), { status: 201 });
		type CreatedHandler = RouteHandlerFor<typeof created, Values>;
		expectTypeOf<ReturnType<CreatedHandler>>().toEqualTypeOf<
			| { status: 201; body: string }
			| string
			| Promise<{ status: 201; body: string } | string>
		>();
	});

	it("requires envelopes when multiple responses are declared", () => {
		const declared = route
			.get("/")
			.response(type<string>())
			.response(type<{ message: string }>(), { status: 404 });
		declared.handler(() => ({ status: 200, body: "ok" }));
		// @ts-expect-error Plain bodies are ambiguous between declared statuses.
		declared.handler(() => "ok");
	});
});

describe("implicit response inference", () => {
	it("preserves sync and async status unions and error envelopes", () => {
		const sync = route
			.get("/")
			.handler(() =>
				Math.random() > 0.5
					? ({ status: 201, body: { id: "new" } } as const)
					: ({ status: 404, body: { message: "missing" } } as const),
			);
		const asyncRoute = route
			.get("/")
			.handler(async () =>
				Math.random() > 0.5
					? ({ status: 201, body: { id: "new" } } as const)
					: ({ status: 404, body: { message: "missing" } } as const),
			);
		expectTypeOf<InferClientResponse<typeof sync>>().toEqualTypeOf<
			InferClientResponse<typeof asyncRoute>
		>();
		expectTypeOf<InferClientResponse<typeof sync>["status"]>().toEqualTypeOf<
			201 | 404
		>();
	});

	it("infers empty bodies, custom media, and serialized response headers", () => {
		const empty = route.get("/").handler(() => ({ status: 204 }));
		expectTypeOf<InferServerResponse<typeof empty>>().toEqualTypeOf<{
			status: 204;
		}>();
		expectTypeOf<
			InferClientResponse<typeof empty>["body"]
		>().toEqualTypeOf<undefined>();
		const custom = route.get("/").handler(() => ({
			status: 200,
			body: "ok",
			contentType: "text/plain",
			headers: { count: 2, omitted: undefined },
		}));
		expectTypeOf<InferClientResponse<typeof custom>["headers"]>().toEqualTypeOf<
			Record<string, string> & {
				readonly count: "2";
				readonly omitted: undefined;
			}
		>();
		expectTypeOf<
			InferServerResponse<typeof custom>["headers"]
		>().toEqualTypeOf<{
			readonly count: 2;
			readonly omitted: undefined;
		}>();
	});

	it("infers plain, stream, and SSE data independently of metadata", () => {
		const plain = route.handler(() => ({ id: "one" }));
		async function* chunks() {
			yield sse({ data: { count: 1 }, id: "one" });
		}
		const stream = route.handler(chunks);
		const envelope = route
			.get("/")
			.handler(() => ({ status: 200, body: chunks() }));
		expectTypeOf<InferClientResponse<typeof plain>>().toEqualTypeOf<{
			status: 200;
			body: { readonly id: "one" };
			headers: Record<string, string>;
		}>();
		expectTypeOf<InferClientResponse<typeof stream>["body"]>().toEqualTypeOf<
			AsyncIterable<{
				data: { count: number };
				id?: string;
				event?: string;
				retry?: number;
			}>
		>();
		expectTypeOf<
			InferClientResponse<typeof envelope>["status"]
		>().toEqualTypeOf<200>();
		expectTypeOf<InferClientResponse<typeof envelope>["body"]>().toEqualTypeOf<
			InferClientResponse<typeof stream>["body"]
		>();
		expectTypeOf<
			ImplicitResponseKind<
				| { status: 204 }
				| { body: string }
				| { body: AsyncIterable<number> }
				| { body: string; contentType: "text/plain" }
			>
		>().toEqualTypeOf<"empty" | "json" | "stream" | "custom">();
	});

	it("infers plain bodies and envelopes per returned member", () => {
		const mixed = route
			.get("/")
			.handler(() =>
				Math.random() > 0.5
					? { id: "one" }
					: { status: 404, body: { message: "missing" } },
			);
		type Client = InferClientResponse<typeof mixed>;
		expectTypeOf<Client["status"]>().toEqualTypeOf<200 | 404>();
		expectTypeOf<Extract<Client, { status: 200 }>["body"]>().toEqualTypeOf<{
			readonly id: "one";
		}>();
		const textStatus = route.handler(() => ({ id: "one", status: "open" }));
		expectTypeOf<InferClientResponse<typeof textStatus>>().toEqualTypeOf<{
			status: 200;
			body: { readonly id: "one"; readonly status: "open" };
			headers: Record<string, string>;
		}>();
	});

	it("rejects invalid envelope headers", () => {
		// @ts-expect-error Response headers must be transport scalars.
		route.handler(() => ({ status: 200, headers: { count: {} } }));
	});
});
