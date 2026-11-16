import { createBodyCodecRegistry } from "../codecs/registry.ts";
import { constructBaseRequest, executeRequest } from "./request.ts";

const codecs = createBodyCodecRegistry([]);

describe("request", () => {
	it("passes caller cancellation through to fetch", async () => {
		const controller = new AbortController();
		const fetch = vi.fn(
			async (_request: Request) => new Response(null, { status: 204 }),
		);
		await executeRequest(
			{ method: "GET", path: "/" },
			[undefined, { signal: controller.signal }],
			{
				origin: "http://localhost",
				codecs,
				fetch,
			},
		);
		const [request] = fetch.mock.calls[0]!;
		expect(request.url).toBe("http://localhost/");
		controller.abort();
		expect(request.signal.aborted).toBe(true);
	});

	it.each(["timeout", "caller", "combined timeout", "combined caller"])(
		"allows %s to abort a pending fetch",
		async (source) => {
			vi.useFakeTimers();
			try {
				const controller = new AbortController();
				let started!: () => void;
				const ready = new Promise<void>((resolve) => {
					started = resolve;
				});
				const fetch = vi.fn(
					(request: Request) =>
						new Promise<Response>((_resolve, reject) => {
							request.signal.addEventListener(
								"abort",
								() => reject(request.signal.reason),
								{ once: true },
							);
							started();
						}),
				);
				const request = executeRequest(
					{ method: "GET", path: "/" },
					[
						undefined,
						{ signal: source !== "timeout" ? controller.signal : undefined },
					],
					{
						origin: "http://localhost",
						codecs,
						fetch,
						timeoutMs: source !== "caller" ? 100 : undefined,
					},
				);
				const rejection = expect(request).rejects.toMatchObject({
					name: "AbortError",
				});
				await ready;
				if (source.endsWith("caller")) controller.abort();
				else await vi.advanceTimersByTimeAsync(100);
				await rejection;
			} finally {
				vi.useRealTimers();
			}
		},
	);

	it("stops the timeout when fetch returns even if the response body is still pending", async () => {
		vi.useFakeTimers();
		try {
			let signal: AbortSignal | null | undefined;
			const body = new ReadableStream<Uint8Array>({});
			const response = await executeRequest({ method: "GET", path: "/" }, [], {
				origin: "http://localhost",
				codecs,
				timeoutMs: 100,
				fetch: async (request) => {
					signal = request.signal;
					return new Response(body);
				},
			});
			await vi.advanceTimersByTimeAsync(200);
			expect(signal?.aborted).toBe(false);
			expect(response.bodyUsed).toBe(false);
			await response.body?.cancel();
		} finally {
			vi.useRealTimers();
		}
	});
	it("encodes path segments, repeated query values and defined headers", () => {
		const request = constructBaseRequest(
			"https://example.test",
			"/api",
			{ method: "GET", path: "/users/:id/:slug" },
			{
				params: { id: "a/b", slug: "hello world" },
				query: { tags: ["a", "b"], missing: undefined, page: 0 },
				headers: { count: 0, missing: undefined },
			},
		);
		expect(request.url).toBe(
			"https://example.test/api/users/a%2Fb/hello%20world?tags%5B%5D=a&tags%5B%5D=b&page=0",
		);
		expect(request.headers).toEqual({ count: "0" });
		// The mount path alone serves the `/` route.
		expect(
			constructBaseRequest(undefined, "/api", { method: "GET", path: "/" }, {})
				.url,
		).toBe("/api");
	});

	it("serializes JSON and applies header precedence", async () => {
		const fetch = vi.fn(
			async (_request: Request) => new Response(null, { status: 204 }),
		);
		await executeRequest(
			{
				method: "POST",
				path: "/users",
				request: { body: [] },
			},
			[
				{ body: { name: "Ada" }, headers: { "x-token": "request" } },
				{
					additionalHeaders: {
						"x-token": "additional",
						"X-Extra": 2,
						"Content-Type": "text/plain",
					},
					cache: "no-store",
				},
			],
			{
				origin: "https://example.test",
				codecs,
				fetch,
				globalHeaders: {
					"X-Token": async () => "global",
					omitted: () => undefined,
				},
				fetchOptions: { cache: "reload" },
			},
		);
		const [request] = fetch.mock.calls[0]!;
		expect(request).toMatchObject({
			url: "https://example.test/users",
			method: "POST",
			cache: "no-store",
		});
		expect(Object.fromEntries(request.headers)).toEqual({
			"x-token": "request",
			"x-extra": "2",
			"content-type": "application/json",
		});
		expect(await request.text()).toBe('{"name":"Ada"}');
	});

	it("leaves the content type of a FormData body to the runtime over a passed header", async () => {
		const fetch = vi.fn(
			async (_request: Request) => new Response(null, { status: 204 }),
		);
		await executeRequest(
			{
				method: "POST",
				path: "/upload",
				request: { body: [] },
			},
			[
				{ body: new FormData() },
				{ additionalHeaders: { "content-type": "multipart/form-data" } },
			],
			{ origin: "http://localhost", codecs, fetch },
		);
		// Fetch sets the multipart content type with its boundary.
		expect(fetch.mock.calls[0]![0].headers.get("content-type")).toMatch(
			/^multipart\/form-data; boundary=/,
		);
	});

	it("rejects a missing path param instead of sending it as undefined", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 204 }));
		await expect(
			executeRequest({ method: "GET", path: "/users/:id" }, [{ params: {} }], {
				origin: "http://localhost",
				codecs,
				fetch,
			}),
		).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});
});
