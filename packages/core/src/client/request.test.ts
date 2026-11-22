import { bodyCodec } from "../codecs/bodyCodec.ts";
import { createBodyCodecRegistry } from "../codecs/registry.ts";
import { serializedBody } from "../codecs/serializedBody.ts";
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
					"x-version": Promise.resolve("2026-09"),
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
			"x-version": "2026-09",
			"content-type": "application/json",
		});
		expect(await request.text()).toBe('{"name":"Ada"}');
	});

	it("chooses the body format from the call's, additional or global content type", async () => {
		const fetch = vi.fn(
			async (_request: Request) => new Response(null, { status: 204 }),
		);
		const post = (call: object, additional: object = {}) =>
			executeRequest(
				{ method: "POST", path: "/", request: { body: [] } },
				[{ body: "Ada", ...call }, { additionalHeaders: additional }],
				{
					origin: "http://localhost",
					codecs,
					fetch,
					globalHeaders: { "Content-Type": "text/plain" },
				},
			);
		await post({});
		await post({}, { "content-type": "text/csv" });
		await post(
			{ headers: { "content-type": "application/json" } },
			{
				"content-type": "text/csv",
			},
		);
		const sent = await Promise.all(
			fetch.mock.calls.map(async ([request]) => [
				request.headers.get("content-type"),
				await request.text(),
			]),
		);
		expect(sent).toEqual([
			["text/plain", "Ada"],
			["text/csv", "Ada"],
			["application/json", '"Ada"'],
		]);
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

	it("passes the call's headers to the codec and sends the headers it returns over them", async () => {
		const fetch = vi.fn(
			async (_request: Request) => new Response(null, { status: 204 }),
		);
		const seen = vi.fn();
		const text = bodyCodec("text/plain", {
			serialize: (value, headers) => {
				seen(headers);
				return serializedBody(String(value), {
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"x-format": "codec",
					},
				});
			},
		});
		await executeRequest(
			{ method: "POST", path: "/", request: { body: [] } },
			[
				{
					headers: { "content-type": "text/plain", "x-format": "call" },
					body: "Ada",
				},
			],
			{
				origin: "http://localhost",
				codecs: createBodyCodecRegistry([text]),
				fetch,
			},
		);
		expect(seen).toHaveBeenCalledWith({
			"content-type": "text/plain",
			"x-format": "call",
		});
		const { headers } = fetch.mock.calls[0]![0];
		expect(headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(headers.get("x-format")).toBe("codec");
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
