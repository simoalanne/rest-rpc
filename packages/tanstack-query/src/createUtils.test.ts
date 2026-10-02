import {
	QueryClient,
	skipToken,
	type QueryFunction,
} from "@tanstack/query-core";
import { createTanstackUtilsForRoute } from "./createUtils.ts";

describe("createUtils", () => {
	it("builds route keys and forwards query requests, fetch options, and the query signal", async () => {
		const fetchData = vi.fn().mockResolvedValue("result");
		const utils = createTanstackUtilsForRoute({
			routePath: ["users", "list"],
			fetchData,
		});
		const request = { page: 1 };
		const signal = new AbortController().signal;
		const options = utils.queryOptions({
			request,
			staleTime: 100,
			fetchOptions: { credentials: "include" },
		});
		expect(options.queryKey).toEqual(["users", "list", request]);
		expect(options.staleTime).toBe(100);
		expect(options).not.toHaveProperty("request");
		expect(options).not.toHaveProperty("fetchOptions");
		expect(
			await (
				options.queryFn as (context: {
					signal: AbortSignal;
				}) => Promise<unknown>
			)({ signal }),
		).toBe("result");
		expect(fetchData).toHaveBeenCalledWith(request, {
			credentials: "include",
			signal,
		});
		expect(utils.queryKey()).toEqual(["users", "list"]);
		expect(utils.queryKey(request)).toEqual(options.queryKey);
		expect(utils.mutationKey()).toEqual(["users", "list"]);
	});

	it("uses skipToken for disabled queries and preserves explicit query keys", () => {
		const utils = createTanstackUtilsForRoute({
			routePath: ["list"],
			fetchData: vi.fn(),
		});
		for (const options of [
			utils.queryOptions({ request: skipToken }),
			utils.infiniteQueryOptions({ request: skipToken }),
			utils.streamedQueryOptions!({ request: skipToken }),
		]) {
			expect(options.queryFn).toBe(skipToken);
			expect(options.queryKey).toEqual(["list"]);
		}
		expect(
			utils.queryOptions({ request: skipToken, queryKey: ["custom"] }).queryKey,
		).toEqual(["custom"]);
	});

	it("maps infinite page parameters to requests and forwards mutation variables", async () => {
		const fetchData = vi.fn().mockResolvedValue("ok");
		const utils = createTanstackUtilsForRoute({
			routePath: ["list"],
			fetchData,
		});
		const options = utils.infiniteQueryOptions({
			request: (page: number) => ({ page }),
			initialPageParam: 0,
		});
		await (
			options.queryFn as (context: { pageParam: number }) => Promise<unknown>
		)({ pageParam: 2 });
		expect(options.queryKey).toEqual(["list"]);
		expect(fetchData).toHaveBeenLastCalledWith(
			{ page: 2 },
			{ signal: undefined },
		);
		const mutation = utils.mutationOptions({
			fetchOptions: { credentials: "include" },
		});
		await (mutation.mutationFn as (request: unknown) => Promise<unknown>)({
			name: "Ada",
		});
		expect(fetchData).toHaveBeenLastCalledWith(
			{ name: "Ada" },
			{ credentials: "include" },
		);
	});

	it("accumulates streamed chunks, unwraps response envelopes, and supports reducers", async () => {
		async function* stream() {
			yield 1;
			yield 2;
		}
		const client = new QueryClient();
		const utils = createTanstackUtilsForRoute({
			routePath: ["stream"],
			fetchData: async () => ({ body: stream() }),
			unwrapResponseBodyForStream: true,
		});
		const options = utils.streamedQueryOptions!();
		expect(
			await client.fetchQuery({
				queryKey: ["stream"],
				queryFn: options.queryFn as QueryFunction,
			}),
		).toEqual([1, 2]);
		const reduced = utils.streamedQueryOptions!({
			initialValue: 0,
			reducer: (total, chunk) => Number(total) + Number(chunk),
		});
		expect(
			await client.fetchQuery({
				queryKey: ["sum"],
				queryFn: reduced.queryFn as QueryFunction,
			}),
		).toBe(3);
		client.clear();
	});

	it("rejects stream options when the route does not return an async iterable", async () => {
		const client = new QueryClient();
		const utils = createTanstackUtilsForRoute({
			routePath: [],
			fetchData: async () => [],
		});
		await expect(
			client.fetchQuery({
				queryKey: [],
				queryFn: utils.streamedQueryOptions!().queryFn as QueryFunction,
				retry: false,
			}),
		).rejects.toThrow("Route did not return a stream response body");
		client.clear();
	});
});
