import { createClient, route, routeError, sse, type } from "@rest-rpc/core";
import { MutationObserver, QueryClient, skipToken } from "@tanstack/query-core";
import { createTanstackQueryUtils } from "./createUtils.ts";

const UserNotFound = routeError("USER_NOT_FOUND", { status: 404 });
const contract = {
	users: {
		get: route
			.get("/users/:id")
			.params(type<{ id: string }>())
			.response(type<{ name: string }>())
			.error(UserNotFound),
		list: route
			.get("/users")
			.query(type<{ page: number }>())
			.response(type<{ names: string[] }>()),
		create: route
			.post("/users")
			.body(type<{ name: string }>())
			.response(type<{ name: string }>()),
	},
	events: route.get("/events").response(sse(type<{ value: number }>())),
};

const setup = (respond: () => Response) => {
	const fetch = vi.fn(async (_request: Request) => respond());
	const queryUtils = createTanstackQueryUtils(
		createClient(contract, { origin: "https://example.test", fetch }),
	);
	return { fetch, queryUtils, client: new QueryClient() };
};

const eventStream = () =>
	new Response('data: {"value":1}\n\ndata: {"value":2}\n\n', {
		headers: { "content-type": "text/event-stream" },
	});

describe("createTanstackQueryUtils", () => {
	it("mirrors the client tree in query and mutation keys", () => {
		const { queryUtils } = setup(() => Response.json({}));
		const request = { params: { id: "1" } };
		expect(queryUtils.users.get.queryKey(request)).toEqual([
			"users",
			"get",
			request,
		]);
		expect(queryUtils.users.get.queryKey()).toEqual(["users", "get"]);
		expect(queryUtils.events.queryKey()).toEqual(["events"]);
		expect(queryUtils.users.create.mutationKey()).toEqual(["users", "create"]);
		expect(queryUtils.users.get.queryOptions({ request }).queryKey).toEqual(
			queryUtils.users.get.queryKey(request),
		);
		expect(
			queryUtils.users.get.queryOptions({ request, queryKey: ["custom"] })
				.queryKey,
		).toEqual(["custom"]);
		expect(queryUtils.key()).toEqual([]);
		expect(queryUtils.users.key()).toEqual(["users"]);
		expect(queryUtils.users.get.key()).toEqual(["users", "get"]);
	});

	it("starts every query and mutation key with the prefix", async () => {
		const scoped = createTanstackQueryUtils(
			createClient(contract, {
				origin: "https://example.test",
				fetch: async () => Response.json({ name: "Ada" }),
			}),
			{ prefix: ["tenant", 1] },
		);
		const request = { params: { id: "1" } };
		expect(scoped.key()).toEqual(["tenant", 1]);
		expect(scoped.users.key()).toEqual(["tenant", 1, "users"]);
		expect(scoped.users.get.queryKey(request)).toEqual([
			"tenant",
			1,
			"users",
			"get",
			request,
		]);
		expect(scoped.users.get.infiniteQueryKey()).toEqual([
			"tenant",
			1,
			"users",
			"get",
			"~infinite",
		]);
		expect(scoped.users.create.mutationOptions().mutationKey).toEqual([
			"tenant",
			1,
			"users",
			"create",
		]);
		const client = new QueryClient();
		await client.fetchQuery(scoped.users.get.queryOptions({ request }));
		await client.invalidateQueries({ queryKey: scoped.users.key() });
		expect(
			client.getQueryState(scoped.users.get.queryKey(request))?.isInvalidated,
		).toBe(true);
	});

	it("separates query kinds with a segment after the route path", () => {
		const { queryUtils } = setup(() => Response.json({}));
		const request = { query: { page: 1 } };
		expect(queryUtils.users.list.infiniteQueryKey()).toEqual([
			"users",
			"list",
			"~infinite",
		]);
		expect(queryUtils.users.list.infiniteQueryKey(request)).toEqual([
			"users",
			"list",
			"~infinite",
			request,
		]);
		expect(queryUtils.events.streamedQueryKey()).toEqual([
			"events",
			"~streamed",
		]);
		expect(queryUtils.events.queryOptions().queryKey).toEqual(["events"]);
		expect(queryUtils.events.streamedQueryOptions().queryKey).toEqual(
			queryUtils.events.streamedQueryKey(),
		);
		expect(
			queryUtils.users.list.infiniteQueryOptions({
				request: skipToken,
				initialPageParam: 0,
				getNextPageParam: () => undefined,
			}).queryKey,
		).toEqual(["users", "list", "~infinite"]);
	});

	it("fetches queries with the request, fetch options, and query signal", async () => {
		const { fetch, queryUtils, client } = setup(() =>
			Response.json({ name: "Ada" }),
		);
		const options = queryUtils.users.get.queryOptions({
			request: { params: { id: "1" } },
			staleTime: 100,
			fetchOptions: { credentials: "include" },
		});
		expect(options.staleTime).toBe(100);
		expect(options).not.toHaveProperty("request");
		expect(options).not.toHaveProperty("fetchOptions");
		expect(await client.query(options)).toMatchObject({
			status: 200,
			body: { name: "Ada" },
		});
		const [request] = fetch.mock.lastCall!;
		expect(request.url).toBe("https://example.test/users/1");
		expect(request.credentials).toBe("include");
		expect(request.signal).toBeInstanceOf(AbortSignal);
		client.clear();
	});

	it("rejects with the client's errors", async () => {
		const { queryUtils, client } = setup(() =>
			Response.json(
				{ code: "USER_NOT_FOUND", message: "Missing" },
				{ status: 404 },
			),
		);
		await expect(
			client.query(
				queryUtils.users.get.queryOptions({
					request: { params: { id: "1" } },
					retry: false,
				}),
			),
		).rejects.toMatchObject({ code: "USER_NOT_FOUND", status: 404 });
		client.clear();
	});

	it("uses skipToken for disabled queries", () => {
		const { fetch, queryUtils } = setup(() => Response.json({}));
		for (const options of [
			queryUtils.users.get.queryOptions({ request: skipToken }),
			queryUtils.users.list.infiniteQueryOptions({
				request: skipToken,
				initialPageParam: 0,
				getNextPageParam: () => undefined,
			}),
			queryUtils.events.streamedQueryOptions({ request: skipToken }),
		]) {
			expect(options.queryFn).toBe(skipToken);
		}
		expect(
			queryUtils.users.get.queryOptions({ request: skipToken }).queryKey,
		).toEqual(["users", "get"]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("maps infinite page parameters to requests", async () => {
		const { fetch, queryUtils, client } = setup(() =>
			Response.json({ names: ["Ada"] }),
		);
		const options = queryUtils.users.list.infiniteQueryOptions({
			request: (page: number) => ({ query: { page } }),
			initialPageParam: 2,
			getNextPageParam: () => undefined,
		});
		expect(options.queryKey).toEqual(
			queryUtils.users.list.infiniteQueryKey({ query: { page: 2 } }),
		);
		const data = await client.infiniteQuery(options);
		expect(data.pages[0]).toMatchObject({ body: { names: ["Ada"] } });
		expect(fetch.mock.lastCall![0].url).toBe(
			"https://example.test/users?page=2",
		);
		client.clear();
	});

	it("forwards mutation variables and fetch options", async () => {
		const { fetch, queryUtils, client } = setup(() =>
			Response.json({ name: "Ada" }),
		);
		const observer = new MutationObserver(
			client,
			queryUtils.users.create.mutationOptions({
				fetchOptions: { credentials: "include" },
			}),
		);
		expect(await observer.mutate({ body: { name: "Ada" } })).toMatchObject({
			body: { name: "Ada" },
		});
		const [request] = fetch.mock.lastCall!;
		expect(request).toMatchObject({ method: "POST", credentials: "include" });
		expect(await request.text()).toBe(JSON.stringify({ name: "Ada" }));
		client.clear();
	});

	it("accumulates streamed events and supports reducers", async () => {
		const { queryUtils, client } = setup(eventStream);
		expect(
			await client.query(queryUtils.events.streamedQueryOptions()),
		).toEqual([{ data: { value: 1 } }, { data: { value: 2 } }]);
		expect(
			await client.query(
				queryUtils.events.streamedQueryOptions({
					queryKey: ["sum"],
					initialValue: 0,
					reducer: (total, event) => total + event.data.value,
				}),
			),
		).toBe(3);
		client.clear();
	});

	it("allows to call the underlying fetch function directly", async () => {
		const { queryUtils } = setup(() => Response.json({ name: "Ada" }));
		const data = await queryUtils.users.get.fetch({ params: { id: "1" } });
		expect(data).toMatchObject({ body: { name: "Ada" } });
	});
});
