import {
	route as contractRoute,
	routeError,
	type,
	type InferClientResponse,
} from "@rest-rpc/core";
import type { ServerResponse } from "@rest-rpc/core/contract";
import { sse } from "../pipeline/sse.ts";
import type { Context, DefaultContext } from "./context.ts";
import { route } from "./routeBuilder.ts";
import type {
	InferServerHandler,
	InferServerRequest,
	InferServerResponse,
	RouteHandler,
	RouteHandlerFor,
	RouteRequest,
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

	it("narrows the request media type to the declared body media types", () => {
		route.get("/").handler(({ contentType }) => {
			expectTypeOf(contentType).toEqualTypeOf<undefined>();
		});
		route
			.post("/")
			.body(type<string>())
			.handler(({ contentType }) => {
				expectTypeOf(contentType).toEqualTypeOf<"application/json">();
			});
	});

	it("infers handler signatures for a route tree", () => {
		const declaration = contractRoute.get("/").response(type<string>());
		const tree = { users: { get: declaration } };
		expectTypeOf<RouteHandlerFor<typeof tree>["users"]["get"]>().toEqualTypeOf<
			RouteHandler<(typeof declaration)["~restrpc"], DefaultContext>
		>();
	});

	it("infers the context selected for a server route", () => {
		const declared = fieldRoute.get("/").params(type<{ id: string }>());
		type Request = InferServerRequest<typeof declared>;
		expectTypeOf<Request["context"]>().toEqualTypeOf<Context<Values>>();
		expectTypeOf<Request["params"]>().toEqualTypeOf<{ id: string }>();
		expectTypeOf<Request["route"]>().not.toHaveProperty("context");
		expectTypeOf<Request["route"]["method"]>().toEqualTypeOf<"GET">();
		const completed = fieldRoute.handler(() => "ok");
		expectTypeOf<
			InferServerRequest<typeof completed>["context"]
		>().toEqualTypeOf<Context<Values>>();
		const contractDeclared = contractRoute.get("/");
		expectTypeOf<
			InferServerRequest<typeof contractDeclared>["context"]
		>().toEqualTypeOf<Context<DefaultContext>>();
	});

	it("infers handler requests and responses from the handler signature", () => {
		const declared = contractRoute
			.get("/{id}")
			.params(type<{ id: string }>())
			.response(type<string>());
		type Route = (typeof declared)["~restrpc"];
		expectTypeOf<InferServerRequest<typeof declared>>().toEqualTypeOf<
			RouteRequest<Route, DefaultContext>
		>();
		expectTypeOf<InferServerResponse<typeof declared>>().toEqualTypeOf<
			{ status: 200; contentType?: "application/json"; body: string } | string
		>();
		const tree = { users: { get: declared } };
		expectTypeOf<
			InferServerRequest<typeof tree>["users"]["get"]
		>().toEqualTypeOf<Parameters<InferServerHandler<typeof declared>>[0]>();
		expectTypeOf<
			InferServerResponse<typeof tree>["users"]["get"]
		>().toEqualTypeOf<InferServerResponse<typeof declared>>();
	});

	it("returns envelopes or the body of a single declared response", () => {
		const declared = contractRoute.get("/").response(type<string>());
		type Handler = RouteHandlerFor<typeof declared>;
		type Envelope = {
			status: 200;
			contentType?: "application/json";
			body: string;
		};
		expectTypeOf<ReturnType<Handler>>().toEqualTypeOf<
			Envelope | string | Promise<Envelope | string>
		>();
		const created = contractRoute
			.post("/")
			.response(type<string>(), { status: 201 });
		type CreatedHandler = RouteHandlerFor<typeof created>;
		type CreatedEnvelope = {
			status: 201;
			contentType?: "application/json";
			body: string;
		};
		expectTypeOf<ReturnType<CreatedHandler>>().toEqualTypeOf<
			CreatedEnvelope | string | Promise<CreatedEnvelope | string>
		>();
	});

	it("requires envelopes when multiple responses are declared", () => {
		const declared = route
			.get("/")
			.response(type<string>())
			.response(type<{ id: string }>(), { status: 201 });
		declared.handler(() => ({ status: 200, body: "ok" }));
		// @ts-expect-error Plain bodies are ambiguous between declared statuses.
		declared.handler(() => "ok");
	});
});

describe("route errors", () => {
	const Unauthorized = routeError("UNAUTHORIZED", { status: 401 });
	const NotFound = routeError("NOT_FOUND", {
		status: 404,
		data: type<{ id: string }>(),
	});

	it("types declared error classes on middleware and the handler and keeps responses inferred", () => {
		const value = route
			.error(Unauthorized)
			.get("/users/:id")
			.use(({ errors, next }) => {
				expectTypeOf(errors.UNAUTHORIZED).toEqualTypeOf<typeof Unauthorized>();
				return next();
			})
			.error(NotFound)
			.handler(({ errors, params }) => {
				expectTypeOf(errors).toEqualTypeOf<{
					UNAUTHORIZED: typeof Unauthorized;
					NOT_FOUND: typeof NotFound;
				}>();
				if (!params.id) throw new errors.NOT_FOUND({ id: params.id });
				return { id: params.id };
			});
		expectTypeOf<
			InferClientResponse<typeof value>["status"]
		>().toEqualTypeOf<200>();
		route.handler(({ errors }) => {
			expectTypeOf(errors).toEqualTypeOf<{}>();
			return "ok";
		});
	});

	it("requires the errors a reusable middleware declares on routes that use it", () => {
		const auth = route.middleware<{
			errors: { UNAUTHORIZED: typeof Unauthorized };
		}>(({ errors, next }) => {
			expectTypeOf(errors.UNAUTHORIZED).toEqualTypeOf<typeof Unauthorized>();
			return next();
		});
		route.get("/me").error(Unauthorized).use(auth);
		// @ts-expect-error The route does not declare UNAUTHORIZED.
		route.get("/me").use(auth);
		route.middleware(({ errors, next }) => {
			expectTypeOf(errors.UNAUTHORIZED).toEqualTypeOf<unknown>();
			return next();
		});
	});
});

describe("implicit response inference", () => {
	it("preserves sync and async status unions", () => {
		const sync = route
			.get("/")
			.handler(() =>
				Math.random() > 0.5
					? ({ status: 201, body: { id: "new" } } as const)
					: ({ status: 202, body: { queued: true } } as const),
			);
		const asyncRoute = route
			.get("/")
			.handler(async () =>
				Math.random() > 0.5
					? ({ status: 201, body: { id: "new" } } as const)
					: ({ status: 202, body: { queued: true } } as const),
			);
		expectTypeOf<InferClientResponse<typeof sync>>().toEqualTypeOf<
			InferClientResponse<typeof asyncRoute>
		>();
		expectTypeOf<InferClientResponse<typeof sync>["status"]>().toEqualTypeOf<
			201 | 202
		>();
	});

	it("rejects inferred statuses outside 2xx", () => {
		// @ts-expect-error Errors are thrown instead of returned.
		route.handler(() => ({ status: 404, body: { message: "missing" } }));
	});

	it("infers empty bodies, custom media, and response headers", () => {
		const empty = route.get("/").handler(() => ({ status: 204 }));
		expectTypeOf<ServerResponse<(typeof empty)["~restrpc"]>>().toEqualTypeOf<{
			status: 204;
		}>();
		expectTypeOf<
			InferClientResponse<typeof empty>["body"]
		>().toEqualTypeOf<undefined>();
		const custom = route.get("/").handler(() => ({
			status: 200,
			body: "ok",
			contentType: "text/plain",
			headers: { count: 2, enabled: true, omitted: undefined },
		}));
		expectTypeOf<InferClientResponse<typeof custom>["headers"]>().toEqualTypeOf<
			Record<string, string> & {
				readonly count: 2;
				readonly enabled: true;
				readonly omitted: undefined;
			}
		>();
		expectTypeOf<
			ServerResponse<(typeof custom)["~restrpc"]>["headers"]
		>().toEqualTypeOf<{
			readonly count: 2;
			readonly enabled: true;
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
			contentType: "application/json";
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
	});

	it("infers plain bodies and envelopes per returned member", () => {
		const mixed = route
			.get("/")
			.handler(() =>
				Math.random() > 0.5
					? { id: "one" }
					: { status: 202, body: { queued: true } },
			);
		type Client = InferClientResponse<typeof mixed>;
		expectTypeOf<Client["status"]>().toEqualTypeOf<200 | 202>();
		expectTypeOf<Extract<Client, { status: 200 }>["body"]>().toEqualTypeOf<{
			readonly id: "one";
		}>();
		const textStatus = route.handler(() => ({ id: "one", status: "open" }));
		expectTypeOf<InferClientResponse<typeof textStatus>>().toEqualTypeOf<{
			status: 200;
			contentType: "application/json";
			body: { readonly id: "one"; readonly status: "open" };
			headers: Record<string, string>;
		}>();
	});

	it("rejects invalid envelope headers", () => {
		// @ts-expect-error Response headers must be transport scalars.
		route.handler(() => ({ status: 200, headers: { count: {} } }));
	});
});
