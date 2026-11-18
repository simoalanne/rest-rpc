import { type } from "@rest-rpc/core";
import { route } from "../builder/routeBuilder.ts";
import { createApp } from "./createApp.ts";
import { interceptor } from "./interceptor.ts";

// Behavior shared with the Node app is covered by the app conformance tests.

// Entries of routes completed with `.static()` are `Response` values instead.
const handlerOf = (entry: unknown) =>
	entry as (request: Request, ...args: unknown[]) => Promise<Response>;

const routes = {
	root: route.get("/").handler(() => "root"),
	posts: {
		get: route
			.get("/posts/:id")
			.params(type<{ id: string }>())
			.handler(({ params }) => params.id),
		update: route.patch("/posts/:id").handler(({ params }) => params.id),
		fail: route.get("/fail").handler((): string => {
			throw new Error("boom");
		}),
	},
};

const user = route
	.$context<{ user: string }>()
	.get("/user")
	.handler(({ context }) => context.user);

describe("createApp", () => {
	it("lists routes in Bun's routes format with colon params", async () => {
		const app = createApp(routes, { mountPath: "/api" });
		const listed = {
			"/api": ["OPTIONS", "GET"],
			"/api/posts/:id": ["OPTIONS", "GET", "PATCH"],
			"/api/fail": ["OPTIONS", "GET"],
		};
		for (const mountPath of ["/api", "/api/"] as const) {
			const { routes: entries } = createApp(routes, { mountPath });
			expect(
				Object.fromEntries(
					Object.entries(entries).map(([path, methods]) => [
						path,
						Object.keys(methods),
					]),
				),
			).toEqual(listed);
		}

		// Bun's router attaches the decoded params to the request.
		const request = Object.assign(
			new Request("http://localhost/api/posts/a%2Fb"),
			{ params: { id: "a/b" } },
		);
		const response = await handlerOf(app.routes["/api/posts/:id"]!.GET)(
			request,
		);
		expect(await response.json()).toBe("a/b");
	});

	it("sends errors the routes do not handle from Bun's routes as internal server errors", async () => {
		const app = createApp(routes);
		const response = await handlerOf(app.routes["/fail"]!.GET)(
			new Request("http://localhost/fail"),
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
		});
	});

	it("seeds the context of Bun's routes from the request", async () => {
		const app = createApp(
			{ user },
			{
				context: async (request) => ({ user: request.headers.get("x-user")! }),
			},
		);
		const response = await handlerOf(app.routes["/user"]!.GET)(
			new Request("http://localhost/user", { headers: { "x-user": "Ada" } }),
		);
		expect(await response.json()).toBe("Ada");
	});

	it("sends HEAD error responses without a body", async () => {
		const fail = route.get("/fail").handler((): string => {
			throw new Error("handler failed");
		});
		const app = createApp({ fail });
		for (const [path, status] of [
			["/fail", 500],
			["/missing", 404],
		] as const) {
			const response = await app.fetch(
				new Request(`http://localhost${path}`, { method: "HEAD" }),
			);
			expect(response.status).toBe(status);
			expect(response.body).toBeNull();
		}
	});

	it("passes the runtime arguments after the request to the context function", async () => {
		const app = createApp(
			{ user },
			{ context: (_request, env: { user: string }) => ({ user: env.user }) },
		);
		const request = () => new Request("http://localhost/user");
		const fromFetch = await app.fetch(request(), { user: "fetch" });
		expect(await fromFetch.json()).toBe("fetch");
		const fromRoutes = await handlerOf(app.routes["/user"]!.GET)(request(), {
			user: "routes",
		});
		expect(await fromRoutes.json()).toBe("routes");
	});

	it("passes the runtime arguments after the request to interceptors", async () => {
		const seen: unknown[] = [];
		const record = interceptor(({ args, next }) => {
			seen.push(args);
			return next();
		});
		const app = createApp<typeof routes, [string]>(routes, {
			interceptors: [record],
		});
		await app.fetch(new Request("http://localhost/"), "fetch");
		await handlerOf(app.routes["/"]!.GET)(
			new Request("http://localhost/"),
			"routes",
		);
		expect(seen).toEqual([["fetch"], ["routes"]]);
	});

	it("continues interceptors with a request they pass to next, as often as they call it", async () => {
		const echo = route
			.get("/echo")
			.headers(type<{ "x-attempt": string }>())
			.handler(({ headers }) => headers["x-attempt"]);
		let attempts = 0;
		const retry = interceptor(async ({ request, next }) => {
			const first = await next();
			if (first.status !== 503) return first;
			const headers = new Headers(request.headers);
			headers.set("x-attempt", "2");
			return next(new Request(request, { headers }));
		});
		const flaky = interceptor(({ next }) =>
			++attempts === 1 ? new Response(null, { status: 503 }) : next(),
		);
		const app = createApp({ echo }, { interceptors: [retry, flaky] });
		const response = await app.fetch(new Request("http://localhost/echo"));
		expect(await response.json()).toBe("2");
		expect(attempts).toBe(2);
	});

	it("runs interceptors with the route for Bun's routes, except static ones", async () => {
		const tagged = interceptor(async ({ next, route }) => {
			const response = await next();
			response.headers.set("x-route", route!.path!);
			return response;
		});
		const app = createApp(
			{ ...routes, about: route.get("/about").static("about") },
			{ interceptors: [tagged] },
		);
		const response = await handlerOf(app.routes["/posts/:id"]!.GET)(
			Object.assign(new Request("http://localhost/posts/1"), {
				params: { id: "1" },
			}),
		);
		expect(await response.json()).toBe("1");
		expect(response.headers.get("x-route")).toBe("/posts/:id");
		expect(app.routes["/about"]!.GET).toBeInstanceOf(Response);
	});

	it("runs interceptors for OPTIONS requests to Bun's routes", async () => {
		const preflight = interceptor(({ request, next }) =>
			request.method === "OPTIONS"
				? new Response(null, { status: 204 })
				: next(),
		);
		const options = new Request("http://localhost/posts/1", {
			method: "OPTIONS",
		});
		const answered = await handlerOf(
			createApp(routes, { interceptors: [preflight] }).routes["/posts/:id"]!
				.OPTIONS,
		)(options);
		expect(answered.status).toBe(204);
		const unanswered = await handlerOf(
			createApp(routes).routes["/posts/:id"]!.OPTIONS,
		)(options);
		expect(unanswered.status).toBe(404);
	});
});
