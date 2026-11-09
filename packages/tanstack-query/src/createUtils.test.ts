import { createClient, route, routeError, sse, type } from "@rest-rpc/core";
import { MutationObserver, QueryClient, skipToken } from "@tanstack/query-core";
import { createTanstackQueryUtils } from "./createUtils.ts";

const UserNotFound = routeError("USER_NOT_FOUND", { status: 404 });
const contract = {
	users: {
		get: route
			.get("/users/{id}")
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
	const fetch = vi.fn(
		async (_input: string | URL | Request, _init?: RequestInit) => respond(),
	);
	const utils = createTanstackQueryUtils(
		createClient(contract, { baseUrl: "https://example.test", fetch }),
	);
	return { fetch, utils, client: new QueryClient() };
};

const eventStream = () =>
	new Response('data: {"value":1}\n\ndata: {"value":2}\n\n', {
		headers: { "content-type": "text/event-stream" },
	});

describe("createTanstackQueryUtils", () => {
	it("mirrors the client tree in query and mutation keys", () => {
		const { utils } = setup(() => Response.json({}));
		const request = { params: { id: "1" } };
		expect(utils.users.get.queryKey(request)).toEqual([
			"users",
			"get",
			request,
		]);
		expect(utils.users.get.queryKey()).toEqual(["users", "get"]);
		expect(utils.events.queryKey()).toEqual(["events"]);
		expect(utils.users.create.mutationKey()).toEqual(["users", "create"]);
		expect(utils.users.get.queryOptions({ request }).queryKey).toEqual(
			utils.users.get.queryKey(request),
		);
		expect(
			utils.users.get.queryOptions({ request, queryKey: ["custom"] }).queryKey,
		).toEqual(["custom"]);
	});

	it("separates query kinds with a segment after the route path", () => {
		const { utils } = setup(() => Response.json({}));
		const request = { query: { page: 1 } };
		expect(utils.users.list.infiniteQueryKey()).toEqual([
			"users",
			"list",
			"~infinite",
		]);
		expect(utils.users.list.infiniteQueryKey(request)).toEqual([
			"users",
			"list",
			"~infinite",
			request,
		]);
		expect(utils.events.streamedQueryKey()).toEqual(["events", "~streamed"]);
		expect(utils.events.queryOptions().queryKey).toEqual(["events"]);
		expect(utils.events.streamedQueryOptions().queryKey).toEqual(
			utils.events.streamedQueryKey(),
		);
		expect(
			utils.users.list.infiniteQueryOptions({
				request: skipToken,
				initialPageParam: 0,
				getNextPageParam: () => undefined,
			}).queryKey,
		).toEqual(["users", "list", "~infinite"]);
	});

	it("fetches queries with the request, fetch options, and query signal", async () => {
		const { fetch, utils, client } = setup(() =>
			Response.json({ name: "Ada" }),
		);
		const options = utils.users.get.queryOptions({
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
		const [url, init] = fetch.mock.lastCall!;
		expect(String(url)).toBe("https://example.test/users/1");
		expect(init).toMatchObject({ credentials: "include" });
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		client.clear();
	});

	it("rejects with the client's errors", async () => {
		const { utils, client } = setup(() =>
			Response.json(
				{ code: "USER_NOT_FOUND", message: "Missing" },
				{ status: 404 },
			),
		);
		await expect(
			client.query(
				utils.users.get.queryOptions({
					request: { params: { id: "1" } },
					retry: false,
				}),
			),
		).rejects.toMatchObject({ code: "USER_NOT_FOUND", status: 404 });
		client.clear();
	});

	it("uses skipToken for disabled queries", () => {
		const { fetch, utils } = setup(() => Response.json({}));
		for (const options of [
			utils.users.get.queryOptions({ request: skipToken }),
			utils.users.list.infiniteQueryOptions({
				request: skipToken,
				initialPageParam: 0,
				getNextPageParam: () => undefined,
			}),
			utils.events.streamedQueryOptions({ request: skipToken }),
		]) {
			expect(options.queryFn).toBe(skipToken);
		}
		expect(
			utils.users.get.queryOptions({ request: skipToken }).queryKey,
		).toEqual(["users", "get"]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("maps infinite page parameters to requests", async () => {
		const { fetch, utils, client } = setup(() =>
			Response.json({ names: ["Ada"] }),
		);
		const options = utils.users.list.infiniteQueryOptions({
			request: (page: number) => ({ query: { page } }),
			initialPageParam: 2,
			getNextPageParam: () => undefined,
		});
		expect(options.queryKey).toEqual(
			utils.users.list.infiniteQueryKey({ query: { page: 2 } }),
		);
		const data = await client.infiniteQuery(options);
		expect(data.pages[0]).toMatchObject({ body: { names: ["Ada"] } });
		expect(String(fetch.mock.lastCall![0])).toBe(
			"https://example.test/users?page=2",
		);
		client.clear();
	});

	it("forwards mutation variables and fetch options", async () => {
		const { fetch, utils, client } = setup(() =>
			Response.json({ name: "Ada" }),
		);
		const observer = new MutationObserver(
			client,
			utils.users.create.mutationOptions({
				fetchOptions: { credentials: "include" },
			}),
		);
		expect(await observer.mutate({ body: { name: "Ada" } })).toMatchObject({
			body: { name: "Ada" },
		});
		expect(fetch.mock.lastCall![1]).toMatchObject({
			method: "POST",
			body: JSON.stringify({ name: "Ada" }),
			credentials: "include",
		});
		client.clear();
	});

	it("accumulates streamed events and supports reducers", async () => {
		const { utils, client } = setup(eventStream);
		expect(await client.query(utils.events.streamedQueryOptions())).toEqual([
			{ data: { value: 1 } },
			{ data: { value: 2 } },
		]);
		expect(
			await client.query(
				utils.events.streamedQueryOptions({
					queryKey: ["sum"],
					initialValue: 0,
					reducer: (total, event) => total + event.data.value,
				}),
			),
		).toBe(3);
		client.clear();
	});
});
