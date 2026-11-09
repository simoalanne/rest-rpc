import {
	route as contractRoute,
	routeError,
	type,
	type InferClientResponse,
	type RouteError,
} from "@rest-rpc/core";
import type { ServerResponse } from "@rest-rpc/core/contract";
import { respond } from "../pipeline/respond.ts";
import { sseEvent } from "../pipeline/sse.ts";
import type { Context, DefaultContext, ExtendContext } from "./context.ts";
import { implement } from "./implement.ts";
import { route } from "./routeBuilder.ts";
import type {
	InferServerHandler,
	InferServerRequest,
	InferServerResponse,
	RouteHandler,
	RouteRequest,
} from "./routeBuilder.types.ts";

type Values = { requestId: string };
const fieldRoute = route.$context<Values>();

describe("routeBuilder types", () => {
	it("checks defined response statuses and bodies", () => {
		const defined = route.get("/").response(type<{ id: string }>());
		defined.handler(() => respond({ id: "ok" }));
		// @ts-expect-error The route only defines status 200.
		defined.handler(() => respond({ id: "missing" }, { status: 404 }));
		// @ts-expect-error The defined body requires a string id.
		defined.handler(() => respond({ id: 1 }));
	});

	it("limits context access and writes to defined keys and values", () => {
		route.$context<{ count: number }>().handler(({ context }) => {
			context.set("count", 1);
			expectTypeOf(context.get("count")).toEqualTypeOf<number>();
			// @ts-expect-error Context keys must be defined.
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

	it("narrows the request media type to the defined body media types", () => {
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
		const definition = contractRoute.get("/").response(type<string>());
		const tree = { users: { get: definition } };
		expectTypeOf<
			InferServerHandler<typeof tree>["users"]["get"]
		>().toEqualTypeOf<
			RouteHandler<(typeof definition)["~restrpc"], DefaultContext>
		>();
	});

	it("infers the context selected for a server route", () => {
		const defined = fieldRoute.get("/").params(type<{ id: string }>());
		type Request = InferServerRequest<typeof defined>;
		expectTypeOf<Request["context"]>().toEqualTypeOf<
			Context<ExtendContext<DefaultContext, Values>>
		>();
		expectTypeOf<Request["params"]>().toEqualTypeOf<{ id: string }>();
		expectTypeOf<Request["route"]>().not.toHaveProperty("context");
		expectTypeOf<Request["route"]["method"]>().toEqualTypeOf<"GET">();
		const completed = fieldRoute.handler(() => "ok");
		expectTypeOf<
			InferServerRequest<typeof completed>["context"]
		>().toEqualTypeOf<Context<ExtendContext<DefaultContext, Values>>>();
		const contractDefined = contractRoute.get("/");
		expectTypeOf<
			InferServerRequest<typeof contractDefined>["context"]
		>().toEqualTypeOf<Context<DefaultContext>>();
	});

	it("infers handler requests and responses from the handler signature", () => {
		const defined = contractRoute
			.get("/{id}")
			.params(type<{ id: string }>())
			.response(type<string>());
		type Route = (typeof defined)["~restrpc"];
		expectTypeOf<InferServerRequest<typeof defined>>().toEqualTypeOf<
			RouteRequest<Route, DefaultContext>
		>();
		type Response = InferServerResponse<typeof defined>;
		expectTypeOf("ok").toExtend<Response>();
		expectTypeOf(respond("ok")).toExtend<Response>();
		expectTypeOf({ status: 200 as const, body: "ok" }).not.toExtend<Response>();
		const tree = { users: { get: defined } };
		expectTypeOf<
			InferServerRequest<typeof tree>["users"]["get"]
		>().toEqualTypeOf<Parameters<InferServerHandler<typeof defined>>[0]>();
		expectTypeOf<
			InferServerResponse<typeof tree>["users"]["get"]
		>().toEqualTypeOf<InferServerResponse<typeof defined>>();
	});

	it("returns respond() results or the body of a single defined response", () => {
		const created = route.post("/").response(type<string>(), { status: 201 });
		created.handler(() => "ok");
		created.handler(() => respond("ok"));
		created.handler(() => respond("ok", { status: 201 }));
		// @ts-expect-error The route only defines status 201.
		created.handler(() => respond("ok", { status: 200 }));
		// @ts-expect-error The defined body is a string.
		created.handler(() => respond(1));
		const empty = route.delete("/").response({ status: 204 });
		empty.handler(() => {});
		empty.handler(() => respond(undefined, { status: 204 }));
	});

	it("requires envelopes when multiple responses are defined", () => {
		const defined = route
			.get("/")
			.response(type<string>())
			.response(type<{ id: string }>(), { status: 201 });
		defined.handler(() => respond("ok"));
		defined.handler(() => respond({ id: "new" }, { status: 201 }));
		// @ts-expect-error Plain bodies are ambiguous between defined statuses.
		defined.handler(() => "ok");
		// @ts-expect-error Only status 200 is the default among several.
		defined.handler(() => respond({ id: "new" }));
	});
});

describe("route errors", () => {
	const Unauthorized = routeError("UNAUTHORIZED", { status: 401 });
	const NotFound = routeError("NOT_FOUND", {
		status: 404,
		data: type<{ id: string }>(),
	});

	it("types defined error factories on middleware and the handler and keeps responses inferred", () => {
		const value = route
			.error(Unauthorized)
			.get("/users/:id")
			.use(({ errors, next }) => {
				expectTypeOf(errors.UNAUTHORIZED).toEqualTypeOf<
					(
						...args: ConstructorParameters<typeof Unauthorized>
					) => InstanceType<typeof Unauthorized>
				>();
				errors.UNAUTHORIZED();
				return next();
			})
			.error(NotFound)
			.handler(({ errors, params }) => {
				expectTypeOf(errors).toHaveProperty("UNAUTHORIZED");
				expectTypeOf(errors.NOT_FOUND).returns.toEqualTypeOf<
					RouteError<"NOT_FOUND", { id: string }, 404, Record<string, unknown>>
				>();
				// @ts-expect-error The data input is required.
				errors.NOT_FOUND();
				if (!params.id) throw errors.NOT_FOUND({ data: { id: params.id } });
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

	it("requires the errors a reusable middleware defines on routes that use it", () => {
		const auth = route.middleware<{
			errors: { UNAUTHORIZED: typeof Unauthorized };
		}>(({ errors, next }) => {
			expectTypeOf(errors.UNAUTHORIZED).returns.toEqualTypeOf<
				RouteError<"UNAUTHORIZED", undefined, 401, Record<string, unknown>>
			>();
			return next();
		});
		route.get("/me").error(Unauthorized).use(auth);
		// @ts-expect-error The route does not define UNAUTHORIZED.
		route.get("/me").use(auth);
		route.middleware(({ errors, next }) => {
			expectTypeOf(errors.UNAUTHORIZED).toEqualTypeOf<unknown>();
			return next();
		});
	});

	it("applies reusable middleware to routes whose context extends its own", () => {
		const timing = route.middleware(({ next }) => next());
		const setUser = route
			.$context<{ user: string }>()
			.middleware(({ context, next }) => {
				context.set("user", "1");
				return next();
			});
		const withUser = route.$context<{ user: string; tenant: string }>();
		withUser
			.use(timing)
			.use(setUser)
			.get("/")
			.use(timing)
			.handler(() => "ok");
		implement({ get: route.get("/").response(type<string>()) })
			.$context<{ user: string }>()
			.use(timing)
			.use(setUser);
		// @ts-expect-error The route context does not define user.
		route.use(setUser);
		// @ts-expect-error The route context types user differently.
		route.$context<{ user: number }>().use(setUser);
	});

	it("extends context at any builder stage", () => {
		route
			.headers(type<{ authorization: string }>())
			.$context<{ user: string }>()
			.use(({ next }) => next())
			.$context<{ tenant: string }>()
			.get("/")
			.$context<{ user: number }>()
			.handler(({ context }) => {
				expectTypeOf(context.get("user")).toEqualTypeOf<number>();
				expectTypeOf(context.get("tenant")).toEqualTypeOf<string>();
				// @ts-expect-error Context keys must be defined.
				context.get("missing");
			});
	});

	it("types reusable middleware by the request and errors of its builder", () => {
		const authed = route
			.$context<{ user: string }>()
			.headers(type<{ authorization: string }>())
			.error(Unauthorized)
			.use(({ next }) => next());
		const auth = authed.middleware<{ query: { debug: string } }>(
			({ headers, query, errors, context, next }) => {
				expectTypeOf(headers).toEqualTypeOf<{ authorization: string }>();
				expectTypeOf(query).toEqualTypeOf<{ debug: string }>();
				if (!headers.authorization) throw errors.UNAUTHORIZED();
				context.set("user", query.debug);
				return next();
			},
		);
		authed
			.query(type<{ debug: string }>())
			.use(auth)
			.get("/")
			.handler(() => "ok");
		// @ts-expect-error The route does not define the authorization header.
		route.$context<{ user: string }>().error(Unauthorized).use(auth);
		route
			.$context<{ user: string }>()
			.headers(type<{ authorization: string }>())
			.query(type<{ debug: string }>())
			// @ts-expect-error The route does not define UNAUTHORIZED.
			.use(auth);
	});
});

describe("implicit response inference", () => {
	it("preserves sync and async status unions", () => {
		const sync = route
			.get("/")
			.handler(() =>
				Math.random() > 0.5
					? respond({ id: "new" }, { status: 201 })
					: respond({ queued: true }, { status: 202 }),
			);
		const asyncRoute = route
			.get("/")
			.handler(async () =>
				Math.random() > 0.5
					? respond({ id: "new" }, { status: 201 })
					: respond({ queued: true }, { status: 202 }),
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
		route.handler(() => respond({ message: "missing" }, { status: 404 }));
	});

	it("infers empty bodies, custom media, and response headers", () => {
		const empty = route
			.get("/")
			.handler(() => respond(undefined, { status: 204 }));
		expectTypeOf<ServerResponse<(typeof empty)["~restrpc"]>>().toEqualTypeOf<{
			status: 204;
		}>();
		expectTypeOf<
			InferClientResponse<typeof empty>["body"]
		>().toEqualTypeOf<undefined>();
		const nothing = route.handler(() => {});
		expectTypeOf<InferClientResponse<typeof nothing>>().toEqualTypeOf<{
			status: 200;
			contentType: undefined;
			body: undefined;
			headers: Record<string, string>;
		}>();
		const custom = route.get("/").handler(() =>
			respond("ok", {
				contentType: "text/plain",
				headers: { count: 2, enabled: true, omitted: undefined },
			}),
		);
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
			yield sseEvent({ count: 1 }, { id: "one" });
		}
		const stream = route.handler(chunks);
		const envelope = route.get("/").handler(() => respond(chunks()));
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
					: respond({ queued: true }, { status: 202 }),
			);
		type Client = InferClientResponse<typeof mixed>;
		expectTypeOf<Client["status"]>().toEqualTypeOf<200 | 202>();
		expectTypeOf<Extract<Client, { status: 200 }>["body"]>().toEqualTypeOf<{
			readonly id: "one";
		}>();
		const statusField = route.handler(() => ({ status: 201, body: "ok" }));
		expectTypeOf<InferClientResponse<typeof statusField>>().toEqualTypeOf<{
			status: 200;
			contentType: "application/json";
			body: { readonly status: 201; readonly body: "ok" };
			headers: Record<string, string>;
		}>();
	});

	it("rejects non-scalar respond() headers", () => {
		// @ts-expect-error Response headers must be transport scalars.
		respond(undefined, { headers: { count: {} } });
	});
});
