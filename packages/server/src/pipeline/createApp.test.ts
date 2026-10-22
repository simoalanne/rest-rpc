import { type } from "@rest-rpc/core";
import { route } from "../builder/routeBuilder.ts";
import { createApp } from "./createApp.ts";

const routes = {
	root: route.get("/").handler(() => "root"),
	todos: {
		get: route
			.get("/todos/:id")
			.params(type<{ id: string }>())
			.handler(({ params }) => params.id),
		update: route.patch("/todos/{id}").handler(({ params }) => params.id),
		fail: route.get("/fail").handler((): string => {
			throw new Error("boom");
		}),
	},
};

describe("createApp", () => {
	it("serves routes from fetch", async () => {
		const app = createApp(routes);
		const response = await app.fetch(new Request("http://localhost/todos/1"));
		expect(await response.json()).toBe("1");
	});

	it("serves routes under the mount path", async () => {
		const app = createApp(routes, { mountPath: "/api" });
		const root = await app.fetch(new Request("http://localhost/api"));
		expect(await root.json()).toBe("root");
		const todo = await app.fetch(new Request("http://localhost/api/todos/1"));
		expect(await todo.json()).toBe("1");
		const outside = await app.fetch(new Request("http://localhost/todos/1"));
		expect(outside.status).toBe(404);
	});

	it("returns notFound for unmatched requests", async () => {
		const fallback = await createApp(routes).fetch(
			new Request("http://localhost/missing"),
		);
		expect(fallback.status).toBe(404);
		expect(await fallback.json()).toEqual({
			code: "NOT_FOUND",
			message: "Not found.",
		});

		const custom = await createApp(routes, {
			notFound: () => new Response("custom", { status: 404 }),
		}).fetch(new Request("http://localhost/missing"));
		expect(await custom.text()).toBe("custom");
	});

	it("keeps the default not found response when notFound returns nothing", async () => {
		const requests: Request[] = [];
		const response = await createApp(routes, {
			notFound: (request) => void requests.push(request),
		}).fetch(new Request("http://localhost/missing"));
		expect(response.status).toBe(404);
		expect(requests).toHaveLength(1);
	});

	it("sends errors the routes do not handle as internal server errors and reports them", async () => {
		const onError = vi.fn();
		const app = createApp(routes, { onError });
		for (const response of [
			await app.fetch(new Request("http://localhost/fail")),
			await app.routes["/fail"]!.GET!(new Request("http://localhost/fail")),
		]) {
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				code: "INTERNAL_SERVER_ERROR",
				message: "Internal server error.",
			});
		}
		expect(onError).toHaveBeenCalledTimes(2);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				code: "INTERNAL_SERVER_ERROR",
				cause: new Error("boom"),
			}),
			expect.any(Request),
		);
	});

	it("lists routes in Bun's routes format with colon params", async () => {
		const app = createApp(routes, { mountPath: "/api" });
		expect(
			Object.fromEntries(
				Object.entries(app.routes).map(([path, methods]) => [
					path,
					Object.keys(methods),
				]),
			),
		).toEqual({
			"/api": ["GET"],
			"/api/todos/:id": ["GET", "PATCH"],
			"/api/fail": ["GET"],
		});

		// Bun's router attaches the decoded params to the request.
		const request = Object.assign(
			new Request("http://localhost/api/todos/a%2Fb"),
			{ params: { id: "a/b" } },
		);
		const response = await app.routes["/api/todos/:id"]!.GET!(request);
		expect(await response.json()).toBe("a/b");
	});

	it("seeds the context from a value or a function", async () => {
		const user = route
			.$context<{ user: string }>()
			.get("/user")
			.handler(({ context }) => context.get("user"));
		const contexts = [
			{ user: "plain" },
			(request: Request) => ({ user: request.headers.get("x-user")! }),
			async (request: Request) => ({ user: request.headers.get("x-user")! }),
		];
		const expected = ["plain", "sync", "async"];
		for (const [index, context] of contexts.entries()) {
			const app = createApp({ user }, { context });
			const request = () =>
				new Request("http://localhost/user", {
					headers: { "x-user": expected[index]! },
				});
			const fromFetch = await app.fetch(request());
			expect(await fromFetch.json()).toBe(expected[index]);
			const fromRoutes = await app.routes["/user"]!.GET!(request());
			expect(await fromRoutes.json()).toBe(expected[index]);
		}
	});

	it("passes the runtime arguments after the request to the context function", async () => {
		const user = route
			.$context<{ user: string }>()
			.get("/user")
			.handler(({ context }) => context.get("user"));
		const app = createApp(
			{ user },
			{ context: (_request, env: { user: string }) => ({ user: env.user }) },
		);
		const request = () => new Request("http://localhost/user");
		const fromFetch = await app.fetch(request(), { user: "fetch" });
		expect(await fromFetch.json()).toBe("fetch");
		const fromRoutes = await app.routes["/user"]!.GET!(request(), {
			user: "routes",
		});
		expect(await fromRoutes.json()).toBe("routes");
	});

	it("sends an internal server error when the context function throws", async () => {
		const app = createApp(routes, {
			context: async () => {
				throw new Error("unauthenticated");
			},
		});
		const response = await app.fetch(new Request("http://localhost/todos/1"));
		expect(response.status).toBe(500);
	});
});
