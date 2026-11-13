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
import type { DefaultContext, ExtendContext } from "./context.ts";
import { implement } from "./implement.ts";
import { route } from "./routeBuilder.ts";
import type {
	InferServerHandler,
	InferServerRequest,
	InferServerResponse,
	InitialContextOf,
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

	it("types the context as a readonly object of the declared values", () => {
		route.$context<{ count: number }>().handler(({ context }) => {
			expectTypeOf(context.count).toEqualTypeOf<number>();
			// @ts-expect-error The context is readonly.
			context.count = 1;
			// @ts-expect-error Context keys must be declared or injected.
			void context.missing;
			return "ok";
		});
	});

	it("passes handler fields and context through middleware to the handler", () => {
		const middleware = fieldRoute.middleware(({ signal, context, next }) => {
			expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
			expectTypeOf(context.requestId).toEqualTypeOf<string>();
			return next();
		});
		fieldRoute
			.use(middleware)
			.get("/")
			.params(type<{ id: string }>())
			.use(({ params, next }) => {
				expectTypeOf(params).toEqualTypeOf<{ id: string }>();
				return next({ context: { itemId: params.id } });
			})
			.handler(({ signal, context }) => {
				expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
				expectTypeOf(context.itemId).toEqualTypeOf<string>();
				return context.requestId;
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
			Readonly<ExtendContext<DefaultContext, Values>>
		>();
		expectTypeOf<Request["params"]>().toEqualTypeOf<{ id: string }>();
		expectTypeOf<Request["route"]>().not.toHaveProperty("context");
		expectTypeOf<Request["route"]["method"]>().toEqualTypeOf<"GET">();
		const completed = fieldRoute.handler(() => "ok");
		expectTypeOf<
			InferServerRequest<typeof completed>["context"]
		>().toEqualTypeOf<Readonly<ExtendContext<DefaultContext, Values>>>();
		const contractDefined = contractRoute.get("/");
		expectTypeOf<
			InferServerRequest<typeof contractDefined>["context"]
		>().toEqualTypeOf<Readonly<DefaultContext>>();
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

	it("adds the context reusable middleware reads and the route lacks to the initial context", () => {
		const timing = route.middleware(({ next }) => next());
		const readUser = route
			.$context<{ user: string }>()
			.middleware(({ context, next }) => {
				expectTypeOf(context.user).toEqualTypeOf<string>();
				return next();
			});
		route
			.$context<{ user: string; tenant: string }>()
			.use(timing)
			.use(readUser)
			.get("/")
			.use(timing)
			.handler(() => "ok");
		const added = route
			.use(readUser)
			.get("/")
			.handler(({ context }) => context.user);
		expectTypeOf<InitialContextOf<(typeof added)["~restrpc"]>>().toEqualTypeOf<
			ExtendContext<DefaultContext, { user: string }>
		>();
		const injected = route
			.use(({ next }) => next({ context: { user: "1" } }))
			.use(readUser)
			.get("/")
			.handler(() => "ok");
		expectTypeOf<
			InitialContextOf<(typeof injected)["~restrpc"]>
		>().toEqualTypeOf<DefaultContext>();
		implement({ get: route.get("/").response(type<string>()) })
			.use(timing)
			.use(readUser);
		// @ts-expect-error The route context types user differently.
		route.$context<{ user: number }>().use(readUser);
	});

	it("intersects context declared at any builder stage", () => {
		route
			.headers(type<{ authorization: string }>())
			.$context<{ user: string }>()
			.use(({ next }) => next())
			.$context<{ tenant: string }>()
			.get("/")
			.$context<{ user: "admin" }>()
			.handler(({ context }) => {
				expectTypeOf(context.user).toEqualTypeOf<"admin">();
				expectTypeOf(context.tenant).toEqualTypeOf<string>();
				return "ok";
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
				expectTypeOf(context.user).toEqualTypeOf<string>();
				if (!headers.authorization) throw errors.UNAUTHORIZED();
				return next({ context: { debug: query.debug } });
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
	it("rejects respond() header names with uppercase letters", () => {
		const headers: Record<string, string> = {};
		respond("ok", { headers: { "x-total": 1 } });
		respond("ok", { headers });
		// @ts-expect-error Received header names are lowercase.
		respond("ok", { headers: { "X-Total": 1 } });
		route.get("/").handler(({ respond }) =>
			// @ts-expect-error Received header names are lowercase.
			respond("ok", { headers: { "X-Total": 1 } }),
		);
	});

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
			cookies: readonly string[];
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
			cookies: readonly string[];
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
			cookies: readonly string[];
		}>();
	});

	it("rejects non-scalar respond() headers", () => {
		// @ts-expect-error Response headers must be transport scalars.
		respond(undefined, { headers: { count: {} } });
	});
});

describe("route metadata", () => {
	type Access = { access: "public" | "admin" };
	const base = route.$meta<Access>();

	it("types middleware route meta as the values set before it, or the shape", () => {
		const authorize = base.middleware(({ route, next }) => {
			expectTypeOf(route.meta).toEqualTypeOf<Partial<Access> | undefined>();
			return next();
		});
		base
			.use(authorize)
			.use(({ route, next }) => {
				expectTypeOf(route.meta).toEqualTypeOf<Partial<Access> | undefined>();
				return next();
			})
			.meta({ access: "admin" })
			.use(({ route, next }) => {
				expectTypeOf(route.meta).toEqualTypeOf<{ readonly access: "admin" }>();
				return next();
			});
		route
			.$meta<{ access: "owner" }>()
			// @ts-expect-error The route meta does not match the middleware shape.
			.use(authorize);
	});

	it("types implementer middleware route meta from the contract shape", () => {
		const contractBase = contractRoute.$meta<Access>();
		const contract = {
			list: contractBase.get("/").meta({ access: "public" }),
			create: contractBase.post("/"),
		};
		const todos = implement(contract).use(({ route, next }) => {
			expectTypeOf(route.meta).toEqualTypeOf<Partial<Access> | undefined>();
			return next();
		});
		todos.create.use(({ route, next }) => {
			expectTypeOf(route.meta).toEqualTypeOf<Partial<Access> | undefined>();
			return next();
		});
		todos.list.use(({ route, next }) => {
			expectTypeOf(route.meta).toEqualTypeOf<{ readonly access: "public" }>();
			return next();
		});
	});
});

describe("middleware responses", () => {
	type User = { id: string };
	const user: User = { id: "1" };
	const findUser = (): User | undefined => user;

	it("requires middleware to return a response", () => {
		route.use(({ next }) => next());
		route.use(() => respond("cached"));
		// @ts-expect-error Middleware must return a response.
		route.use(({ next }) => {
			void next();
		});
		// @ts-expect-error A plain value is not a response.
		route.use(() => "stopped");
		route.use(async ({ next }) => {
			const response = await next();
			expectTypeOf(response.status).toEqualTypeOf<number>();
			expectTypeOf(response.body).toEqualTypeOf<unknown>();
			return response;
		});
	});

	it("infers responses returned synchronously on one branch and from next() on another", () => {
		route
			.response(type<string>())
			.get("/")
			.use(({ respond, next }) => {
				if (Math.random() > 0.5) return respond("cached");
				return next();
			})
			.handler(() => "ok");
		route
			.use(({ respond, next }) =>
				Math.random() > 0.5 ? respond("cached") : next({ context: { user } }),
			)
			.get("/")
			.handler(({ context }) => {
				expectTypeOf(context.user).toEqualTypeOf<User>();
				return "ok";
			});
		const reusable = route.middleware(({ respond, next }) =>
			Math.random() > 0.5 ? respond("cached") : next({ context: { user } }),
		);
		route
			.use(reusable)
			.get("/")
			.handler(({ context }) => {
				expectTypeOf(context.user).toEqualTypeOf<User>();
				return "ok";
			});
	});

	it("accepts objects of the response shape without respond()", () => {
		route.use(() => ({ status: 200, body: "cached" }));
		route.use(async ({ next }) => {
			const { body, status } = await next();
			return { status, body };
		});
		// @ts-expect-error An object without response fields is not a response.
		route.use(() => ({ id: "1" }));
	});

	it("receives respond limited to the statuses the route defines", () => {
		const cached = route
			.response(type<string>())
			.response({ status: 204 })
			.use(({ respond }) => {
				if (Math.random() > 0.5) return respond(undefined, { status: 204 });
				// @ts-expect-error The route does not define status 404.
				return respond(undefined, { status: 404 });
			})
			.get("/");
		cached.handler(({ respond }) => respond("ok"));
		cached.handler(({ respond }) => respond(undefined, { status: 204 }));
		// @ts-expect-error The route does not define status 201.
		cached.handler(({ respond }) => respond("ok", { status: 201 }));
		route.get("/").handler(({ respond }) => respond("ok", { status: 202 }));
		route.middleware(({ respond }) => respond(undefined, { status: 204 }));
	});

	it("types the context of later middleware and the handler with injected values", () => {
		route
			.use(async ({ next }) => {
				if (Math.random() > 0.5) return respond("cached");
				return next({ context: { user } });
			})
			.use(async ({ next }) => {
				const response = await next({ context: { tenant: "t" } });
				return { ...response, headers: { "x-cache": "miss" } };
			})
			.use(({ next }) => next({ context: { maybeUser: findUser() } }))
			.get("/")
			.handler(({ context }) => {
				expectTypeOf(context.user).toEqualTypeOf<User>();
				expectTypeOf(context.tenant).toEqualTypeOf<string>();
				expectTypeOf(context.maybeUser).toEqualTypeOf<User | undefined>();
				return "ok";
			});
		const inject = route.middleware(({ next }) =>
			next({ context: { tenant: "t" } }),
		);
		route
			.use(inject)
			.get("/")
			.handler(({ context }) => {
				expectTypeOf(context.tenant).toEqualTypeOf<string>();
				return "ok";
			});
	});

	it("types static values like handler results", () => {
		const handled = route.get("/").handler(() => ({ ok: true }));
		const staticRoute = route.get("/").static({ ok: true });
		expectTypeOf<InferClientResponse<typeof staticRoute>>().toEqualTypeOf<
			InferClientResponse<typeof handled>
		>();
		// @ts-expect-error The defined body requires a string id.
		route.get("/").response(type<{ id: string }>()).static({ id: 1 });
		// @ts-expect-error Static values are not awaited.
		route.get("/").static(Promise.resolve("ok"));
		const stream = respond(new ReadableStream(), { contentType: "text/plain" });
		// @ts-expect-error Streams can be sent only once.
		route.get("/").static(stream);
	});

	it("omits static() from routes that read the request or run middleware", () => {
		// @ts-expect-error The path has params.
		route.get("/:id").static("ok");
		// @ts-expect-error The prefix has params.
		route.prefix("/orgs/{org}").static("ok");
		// @ts-expect-error The route defines a request segment.
		route.get("/").query(type<{ page: string }>()).static("ok");
		const withMiddleware = route.use(({ next }) => next()).get("/");
		// @ts-expect-error The route runs middleware.
		withMiddleware.static("ok");
	});
});
