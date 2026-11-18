import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { createClient } from "./createClient.ts";
import { clientInterceptor } from "./interceptor.ts";

describe("createClient", () => {
	it("mirrors nested contracts and resolves implicit paths", async () => {
		const fetch = vi.fn(async (_request: Request) => Response.json("Ada"));
		const contract = {
			users: {
				find: route.body(type<{ id: number }>()).response(type<string>()),
			},
		};
		const client = createClient(contract, {
			origin: "https://example.test",
			fetch,
		});
		expect(await client.users.find({ body: { id: 1 } })).toMatchObject({
			status: 200,
			body: "Ada",
		});
		const [request] = fetch.mock.calls[0]!;
		expect(request).toMatchObject({
			method: "POST",
			url: "https://example.test/users/find",
		});
		expect(await request.text()).toBe('{"id":1}');
	});

	it("maps response bodies only when validation is enabled", async () => {
		const contract = route.response(type((value: string) => value.length));
		const options = {
			origin: "http://localhost",
			fetch: async () => Response.json("Ada"),
		};
		expect((await createClient(contract, options)()).body).toBe("Ada");
		expect(
			(await createClient(contract, { ...options, validateResponses: true })())
				.body,
		).toBe(3);
	});

	it("sends requests under the origin and mount path, and needs an origin outside browsers", async () => {
		const fetch = vi.fn(async (_request: Request) => Response.json("Ada"));
		const contract = { users: route.get("/users").response(type<string>()) };
		await createClient(contract, {
			origin: "https://example.test/",
			mountPath: "/api/",
			fetch,
		}).users();
		expect(fetch.mock.calls[0]![0].url).toBe("https://example.test/api/users");
		expect(() =>
			createClient(contract, { origin: "https://example.test/api" }),
		).toThrow(TypeError);
		await expect(createClient(contract, { fetch }).users()).rejects.toThrow(
			TypeError,
		);
	});

	it("sends requests through interceptors in order, with the called route", async () => {
		const calls: string[] = [];
		const fetch = vi.fn(async (request: Request) =>
			request.headers.get("authorization") === "Bearer fresh"
				? Response.json("Ada")
				: new Response(null, { status: 401 }),
		);
		const logging = clientInterceptor(async ({ request, next, route }) => {
			calls.push(`${request.method} ${request.url} ${route.path}`);
			return next();
		});
		const refreshOn401 = clientInterceptor(async ({ request, next }) => {
			const response = await next(request.clone());
			if (response.status !== 401) return response;
			request.headers.set("authorization", "Bearer fresh");
			return next(request);
		});
		const contract = {
			users: {
				rename: route.body(type<string>()).response(type<string>()),
			},
		};
		const client = createClient(contract, {
			origin: "https://example.test",
			fetch,
			interceptors: [logging, refreshOn401],
		});
		const controller = new AbortController();
		expect(
			(
				await client.users.rename(
					{ body: "Ada" },
					{ signal: controller.signal },
				)
			).body,
		).toBe("Ada");
		expect(calls).toEqual([
			"POST https://example.test/users/rename /users/rename",
		]);
		expect(fetch).toHaveBeenCalledTimes(2);
		const sent = fetch.mock.calls[1]![0];
		expect(await sent.text()).toBe('"Ada"');
		controller.abort();
		expect(sent.signal.aborted).toBe(true);
	});

	it("passes the route meta to interceptors", async () => {
		const seen = vi.fn();
		const contract = route
			.$meta<{ access: string }>()
			.meta({ access: "public" })
			.get("/")
			.response(type<string>());
		const client = createClient(contract, {
			origin: "https://example.test",
			fetch: async () => Response.json("Ada"),
			interceptors: [
				clientInterceptor(({ route, next }) => {
					seen(route.meta);
					return next();
				}),
			],
		});
		await client();
		expect(seen).toHaveBeenCalledWith({ access: "public" });
	});
});
