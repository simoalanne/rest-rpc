import { constructBaseRequest, executeRequest } from "./request.ts";

describe("request", () => {
	it("passes caller cancellation through to fetch", async () => {
		const controller = new AbortController();
		const fetch = vi.fn(async () => new Response(null, { status: 204 }));
		await executeRequest(
			{ method: "GET", path: "/" },
			[undefined, { signal: controller.signal }],
			{
				baseUrl: "",
				fetch,
			},
		);
		expect(fetch.mock.calls[0]).toEqual([
			"/",
			expect.objectContaining({ signal: controller.signal }),
		]);
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
					(_input: unknown, init?: RequestInit) =>
						new Promise<Response>((_resolve, reject) => {
							init!.signal!.addEventListener(
								"abort",
								() => reject(init!.signal!.reason),
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
						baseUrl: "",
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
				baseUrl: "",
				timeoutMs: 100,
				fetch: async (_input, init) => {
					signal = init?.signal;
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
			{ method: "GET", path: "/users/{id}/:slug" },
			{
				params: { id: "a/b", slug: "hello world" },
				query: { tags: ["a", "b"], missing: undefined, page: 0 },
				headers: { count: 0, missing: undefined },
			},
		);
		expect(request.url).toBe(
			"https://example.test/users/a%2Fb/hello%20world?tags%5B%5D=a&tags%5B%5D=b&page=0",
		);
		expect(request.headers).toEqual({ count: "0" });
	});

	it("rejects missing path parameters", () => {
		expect(() =>
			constructBaseRequest(
				"",
				{ method: "GET", path: "/users/:id" },
				undefined,
			),
		).toThrow('Missing path param "id"');
	});

	it("requires a declared content type selection for multi-format bodies", () => {
		const route = {
			method: "POST",
			path: "/",
			request: { contentType: ["application/json", "text/plain"] },
		} as const;
		expect(
			constructBaseRequest("", route, { body: "hello" }, "text/plain"),
		).toMatchObject({ body: "hello", contentType: "text/plain" });
		expect(() => constructBaseRequest("", route, { body: "hello" })).toThrow(
			"A contentType option is required",
		);
		expect(() =>
			constructBaseRequest("", route, { body: "hello" }, "image/png"),
		).toThrow("Unsupported request contentType");
	});

	it("serializes JSON and applies header precedence case-insensitively", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 204 }));
		await executeRequest(
			{ method: "POST", path: "/users", request: { body: true } },
			[
				{ body: { name: "Ada" }, headers: { "X-Token": "request" } },
				{
					additionalHeaders: { "x-token": "additional", "X-Extra": 2 },
					cache: "no-store",
				},
			],
			{
				baseUrl: "https://example.test",
				fetch,
				globalHeaders: {
					"X-Token": async () => "global",
					omitted: () => undefined,
				},
				fetchOptions: { cache: "reload" },
			},
		);
		expect(fetch).toHaveBeenCalledWith(
			"https://example.test/users",
			expect.objectContaining({
				method: "POST",
				body: '{"name":"Ada"}',
				cache: "no-store",
				headers: {
					"x-token": "request",
					"x-extra": "2",
					"content-type": "application/json",
				},
			}),
		);
	});
});
