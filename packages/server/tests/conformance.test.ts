import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import {
	bodyCodec,
	createApp,
	createCatchAllHandler,
	errorResponse,
	interceptor,
	onError,
	respond,
	route,
	routeError,
	serializedBody,
	sse,
	type,
	type BodyCodec,
	type CatchAllHandleOptions,
} from "@rest-rpc/server";
import * as node from "@rest-rpc/server/node";
import {
	createServer,
	type IncomingMessage,
	type RequestListener,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream/promises";
import type { RuntimeImplementationTree } from "../src/routing/match.ts";

const withHttpServer = async (
	handler: RequestListener,
	run: (url: string) => Promise<void>,
) => {
	const server = createServer(handler);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	try {
		await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
};

// A failure after the response started can only be reported by closing the
// connection.
const fail = (res: ServerResponse) => {
	if (res.headersSent) {
		res.destroy();
	} else {
		res.statusCode = 500;
		res.end();
	}
};

const consume = async (req: IncomingMessage) => {
	for await (const _chunk of req);
};

// Streams in both directions, as Fetch runtimes do, so stream cases compare.
const withFetchServer = (
	handler: (request: Request) => Response | Promise<Response>,
	run: (url: string) => Promise<void>,
) =>
	withHttpServer(async (req, res) => {
		try {
			const headers = new Headers();
			for (let index = 0; index < req.rawHeaders.length; index += 2) {
				headers.append(req.rawHeaders[index]!, req.rawHeaders[index + 1]!);
			}
			const controller = new AbortController();
			res.once("close", () => !res.writableFinished && controller.abort());
			const hasBody = req.method !== "GET" && req.method !== "HEAD";
			const response = await handler(
				new Request(`http://${req.headers.host}${req.url}`, {
					method: req.method,
					headers,
					body: hasBody
						? ReadableStream.from(req as AsyncIterable<Uint8Array>)
						: undefined,
					duplex: "half",
					signal: controller.signal,
				} as RequestInit & { duplex: "half" }),
			);
			const outgoing: Record<string, string | string[]> = Object.fromEntries(
				response.headers,
			);
			const cookies = response.headers.getSetCookie();
			if (cookies.length > 0) outgoing["set-cookie"] = cookies;
			res.writeHead(response.status, outgoing);
			if (response.body) {
				res.flushHeaders();
				await pipeline(response.body as AsyncIterable<Uint8Array>, res);
			} else {
				res.end();
			}
		} catch {
			fail(res);
		}
	}, run);

// Runtimes

type ServeOptions = {
	handleOptions?: CatchAllHandleOptions;
	bodyCodecs?: readonly BodyCodec[];
	/** Reads the request body before rest-rpc, as a body parser does. */
	readBody?: boolean;
	/** Adds the errors an `onError` interceptor receives. */
	reported?: unknown[];
};

type Serve = (
	routes: RuntimeImplementationTree,
	options: ServeOptions,
	run: (url: string) => Promise<void>,
) => Promise<void>;

const serveFetch: Serve = (routes, options, run) => {
	const handler = createCatchAllHandler(routes, {
		bodyCodecs: options.bodyCodecs,
		interceptors: options.reported && [
			onError((error) => void options.reported!.push(error)),
		],
	});
	return withFetchServer(async (request) => {
		if (options.readBody) await request.text();
		return (
			(await handler(request, options.handleOptions)).response ??
			new Response("unmatched", { status: 404 })
		);
	}, run);
};

const serveNode: Serve = (routes, options, run) => {
	const handler = node.createCatchAllHandler(routes, {
		bodyCodecs: options.bodyCodecs,
		interceptors: options.reported && [
			node.onError((error) => void options.reported!.push(error)),
		],
	});
	return withHttpServer(async (req, res) => {
		try {
			if (options.readBody) await consume(req);
			if (!(await handler(req, res, options.handleOptions)).matched) {
				res.statusCode = 404;
				res.end("unmatched");
			}
		} catch {
			fail(res);
		}
	}, run);
};

/** A promise resolved by calling `resolve`. */
const signal = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => (resolve = done));
	return { promise, resolve };
};

// Fixtures

const invalid: StandardSchemaV1<unknown, unknown> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid value" }] }),
	},
};

const validationRoutes = {
	request: route
		.post("/invalid-request")
		.body(invalid)
		.response({ status: 204 })
		.handler(() => respond(undefined, { status: 204 })),
	response: route
		.get("/invalid-response")
		.response(invalid)
		.handler(() => respond("unchecked")),
};

const postJson = (url: string, body: unknown) =>
	fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

// Cases every runtime must handle the same way.

describe.each([
	{ name: "fetch", serve: serveFetch },
	{ name: "node", serve: serveNode },
])("$name route conformance", ({ serve }) => {
	it("runs interceptors around matched routes, sending route errors and rejecting with others", async () => {
		const failure = new Error("handler failed");
		const Gone = routeError("GONE", { status: 410 });
		const routes = {
			fail: route.get("/fail").handler((): string => {
				throw failure;
			}),
			gone: route
				.get("/gone")
				.error(Gone)
				.handler((): string => {
					throw new Gone();
				}),
		};
		const reported: unknown[] = [];
		await serve(routes, { reported }, async (url) => {
			expect((await fetch(`${url}/gone`)).status).toBe(410);
			// The handler rejects, for the framework's error handling.
			expect((await fetch(`${url}/fail`)).status).toBe(500);
			expect((await fetch(`${url}/missing`)).status).toBe(404);
		});
		expect(reported).toEqual([expect.any(Gone), failure]);
	});

	it("serves params, body, headers and the request signal under a mount path", async () => {
		const routes = {
			create: route
				.post("/users/:id")
				.params(type<{ id: string }>())
				.body(type<{ name: string }>())
				.handler(({ params, body, signal }) => {
					expect(signal).toBeInstanceOf(AbortSignal);
					return respond(
						{ id: params.id, name: body.name },
						{ status: 201, headers: { "x-route": "create", "x-count": 1 } },
					);
				}),
		};
		await serve(
			routes,
			{ handleOptions: { mountPath: "/api" } },
			async (url) => {
				const response = await postJson(`${url}/api/users/42`, {
					name: "Ada",
				});
				expect(response.status).toBe(201);
				expect(response.headers.get("x-route")).toBe("create");
				expect(response.headers.get("x-count")).toBe("1");
				expect(await response.json()).toEqual({ id: "42", name: "Ada" });
			},
		);
	});

	it("passes params of dynamic path segments without a params schema as strings", async () => {
		const routes = {
			post: route.get("/users/:id/posts/:slug").handler(({ params }) => params),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/users/1/posts/a%20b`);
			expect(await response.json()).toEqual({ id: "1", slug: "a b" });
		});
	});

	it("serves prefixed tree-derived routes with params from the prefix", async () => {
		const routes = {
			posts: route
				.prefix("/tenants/:tenant")
				.get()
				.handler(({ params }) => params),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/tenants/acme/posts`);
			expect(await response.json()).toEqual({ tenant: "acme" });
		});
	});

	it("leaves unmatched requests to the host", async () => {
		const routes = {
			current: route.get("/current").handler(() => ({ name: "Ada" })),
		};
		await serve(
			routes,
			{ handleOptions: { mountPath: "/api" } },
			async (url) => {
				for (const path of ["/current", "/api/missing"]) {
					const response = await fetch(`${url}${path}`);
					expect(response.status).toBe(404);
					expect(await response.text()).toBe("unmatched");
				}
			},
		);
	});

	it("rejects a request body content type the route does not declare", async () => {
		const handler = vi.fn(() => respond(undefined, { status: 204 }));
		const routes = {
			echo: route.post("/echo").body(type<{ name: string }>()).handler(handler),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/echo`, {
				method: "POST",
				headers: { "content-type": "text/plain" },
				body: "Ada",
			});
			expect(response.status).toBe(415);
			expect(await response.json()).toEqual({
				code: "UNSUPPORTED_MEDIA_TYPE",
				message: expect.any(String),
			});
			expect(handler).not.toHaveBeenCalled();
		});
	});

	it("ignores the request body of routes without a body schema", async () => {
		const handler = vi.fn(() => respond(undefined, { status: 204 }));
		const routes = { ping: route.post("/ping").handler(handler) };
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/ping`, {
				method: "POST",
				headers: { "content-type": "text/plain" },
				body: "Ada",
			});
			expect(response.status).toBe(204);
			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({ body: undefined }),
			);
		});
	});

	it("sends built-in errors as JSON error responses", async () => {
		await serve(validationRoutes, {}, async (url) => {
			const request = await postJson(`${url}/invalid-request`, {});
			expect(request.status).toBe(400);
			expect(await request.json()).toEqual({
				code: "REQUEST_VALIDATION_FAILED",
				message: expect.any(String),
				data: {
					body: [{ message: "invalid value" }],
					query: [],
					params: [],
					headers: [],
				},
			});
			const malformed = await fetch(`${url}/invalid-request`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			});
			expect(malformed.status).toBe(400);
			expect(await malformed.json()).toEqual({
				code: "MALFORMED_REQUEST_BODY",
				message: expect.any(String),
			});
			const response = await fetch(`${url}/invalid-response`);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				code: "INTERNAL_SERVER_ERROR",
				message: expect.any(String),
			});
		});
	});

	it("sends thrown declared errors with their status, headers and data", async () => {
		const RateLimited = routeError("RATE_LIMITED", {
			status: 429,
			message: "Slow down",
			data: type<{ limit: number }>(),
			headers: type<{ "retry-after": number }>(),
		});
		const routes = {
			limited: route
				.get("/limited")
				.error(RateLimited)
				.handler((): string => {
					throw new RateLimited({
						data: { limit: 10 },
						headers: { "retry-after": 30 },
					});
				}),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/limited`);
			expect(response.status).toBe(429);
			expect(response.headers.get("retry-after")).toBe("30");
			expect(response.headers.get("content-type")).toMatch(
				/^application\/json/,
			);
			expect(await response.json()).toEqual({
				code: "RATE_LIMITED",
				message: "Slow down",
				data: { limit: 10 },
			});
		});
	});

	it("streams server-sent events", async () => {
		const routes = {
			events: route.get("/events").handler(async function* () {
				yield 1;
				yield 2;
			}),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/events`);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toMatch(
				/^text\/event-stream/,
			);
			const text = await response.text();
			expect(text).toContain("data: 1\n\n");
			expect(text).toContain("data: 2\n\n");
		});
	});

	it("sends declared stream response headers", async () => {
		const routes = {
			events: route
				.get("/header-events")
				.response(sse(type<number>()), {
					headers: type<{ "x-stream-id": string }>(),
				})
				.handler(() =>
					respond(
						(async function* () {
							yield 1;
						})(),
						{ headers: { "x-stream-id": "stream_1" } },
					),
				),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/header-events`);
			expect(response.headers.get("x-stream-id")).toBe("stream_1");
			expect(await response.text()).toContain("data: 1\n\n");
		});
	});

	it("ends a stream whose chunk fails validation without delivering it", async () => {
		const routes = {
			events: route
				.get("/invalid-events")
				.response(sse(invalid))
				.handler(() =>
					respond(
						(async function* () {
							yield "unchecked";
						})(),
					),
				),
		};
		await serve(routes, {}, async (url) => {
			// Runtimes differ in whether status and headers are already committed
			// or the connection closes, but none may deliver the invalid event.
			const text = await fetch(`${url}/invalid-events`)
				.then((response) => response.text())
				.catch(() => "");
			expect(text).not.toContain("unchecked");
		});
	});

	it("sends bodiless responses without a body", async () => {
		const routes = {
			inferred: route
				.delete("/inferred")
				.handler(() => respond(undefined, { status: 204 })),
			declared: route
				.delete("/declared")
				.response({ status: 204 })
				.handler(() => respond(undefined, { status: 204 })),
		};
		await serve(routes, {}, async (url) => {
			for (const path of ["inferred", "declared"]) {
				const response = await fetch(`${url}/${path}`, {
					method: "DELETE",
				});
				expect(response.status).toBe(204);
				expect(await response.text()).toBe("");
			}
		});
	});

	it("serves the same static response to every request", async () => {
		const routes = {
			robots: route.get("/robots.txt").static(
				respond("User-agent: *", {
					headers: {
						"content-type": "text/plain",
						"cache-control": "max-age=60",
					},
				}),
			),
			legacy: route
				.get("/legacy.txt")
				.static(
					new Response("legacy", { headers: { "content-type": "text/plain" } }),
				),
		};
		await serve(routes, {}, async (url) => {
			for (let index = 0; index < 2; index += 1) {
				const response = await fetch(`${url}/robots.txt`);
				expect(response.headers.get("cache-control")).toBe("max-age=60");
				expect(await response.text()).toBe("User-agent: *");
				const raw = await fetch(`${url}/legacy.txt`);
				expect(raw.headers.get("content-type")).toBe("text/plain");
				expect(await raw.text()).toBe("legacy");
			}
		});
	});

	it("answers HEAD requests to GET routes with the GET status and headers, without a body", async () => {
		let streamed = false;
		const routes = {
			post: route
				.get("/posts/:id")
				.handler(({ params }) =>
					respond({ id: params.id }, { headers: { etag: '"1"' } }),
				),
			events: route.get("/events").handler(async function* () {
				streamed = true;
				yield 1;
			}),
		};
		await serve(routes, {}, async (url) => {
			const head = await fetch(`${url}/posts/1`, { method: "HEAD" });
			expect(head.status).toBe(200);
			expect(head.headers.get("etag")).toBe('"1"');
			expect(head.headers.get("content-type")).toBe("application/json");
			expect(await head.text()).toBe("");
			// The generator of a stream body never runs.
			const events = await fetch(`${url}/events`, { method: "HEAD" });
			expect(await events.text()).toBe("");
			expect(streamed).toBe(false);
		});
	});

	it("serves routes without a path at their tree keys", async () => {
		const routes = {
			users: {
				create: route
					.body(type<{ name: string }>())
					.handler(({ body }) => ({ created: body.name })),
				current: route.get().handler(() => ({ name: "Ada" })),
			},
		};
		await serve(routes, {}, async (url) => {
			const created = await postJson(`${url}/users/create`, {
				name: "Ada",
			});
			expect(created.status).toBe(200);
			expect(await created.json()).toEqual({ created: "Ada" });
			const current = await fetch(`${url}/users/current`);
			expect(current.status).toBe(200);
			expect(await current.json()).toEqual({ name: "Ada" });
		});
	});

	it("decodes request bodies with the default codecs", async () => {
		const describeBody = async (body: unknown) => {
			if (body instanceof FormData)
				return Promise.all(
					[...body].map(async ([name, value]) =>
						typeof value === "string"
							? [name, value]
							: [name, value.name, await value.text()],
					),
				);
			if (body instanceof URLSearchParams) return [...body];
			if (body instanceof Blob) return [body.type, await body.text()];
			return body;
		};
		const routes = {
			decode: route
				.post("/decode")
				.headers(
					type<{
						"content-type":
							| "application/json"
							| "application/x-www-form-urlencoded"
							| "multipart/form-data"
							| "text/plain"
							| "application/octet-stream";
					}>(),
				)
				.body(type<unknown>())
				.handler(({ body }) => describeBody(body)),
		};
		await serve(routes, {}, async (url) => {
			const decode = async (body: string | FormData, contentType?: string) => {
				const response = await fetch(`${url}/decode`, {
					method: "POST",
					headers: contentType ? { "content-type": contentType } : {},
					body,
				});
				return response.json();
			};
			const form = new FormData();
			form.set("name", "Ada");
			form.set("file", new Blob(["hi"]), "a.txt");
			expect(await decode('{"a":1}', "application/json")).toEqual({ a: 1 });
			expect(
				await decode("a=1&b=2", "application/x-www-form-urlencoded"),
			).toEqual([
				["a", "1"],
				["b", "2"],
			]);
			expect(await decode(form)).toEqual([
				["name", "Ada"],
				["file", "a.txt", "hi"],
			]);
			expect(await decode("\uFEFFAda", "text/plain")).toBe("Ada");
			expect(await decode("raw", "application/octet-stream")).toEqual([
				"application/octet-stream",
				"raw",
			]);
		});
	});

	it("serializes FormData response bodies", async () => {
		const routes = {
			form: route.get("/form").handler(() => {
				const body = new FormData();
				body.set("name", "Ada");
				return respond(body);
			}),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/form`);
			expect(response.status).toBe(200);
			expect((await response.formData()).get("name")).toBe("Ada");
		});
	});

	it("sends Blob response bodies with the content type of their header", async () => {
		const routes = {
			file: route.get("/file").handler(() =>
				respond(new Blob(["file"], { type: "text/plain" }), {
					headers: { "content-type": "application/octet-stream" },
				}),
			),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/file`);
			expect(response.headers.get("content-type")).toBe(
				"application/octet-stream",
			);
			expect(await response.text()).toBe("file");
		});
	});

	it("streams binary response bodies", async () => {
		const routes = {
			bytes: route.get("/bytes").handler(() =>
				respond(
					(async function* () {
						yield new TextEncoder().encode("A");
						yield new TextEncoder().encode("B");
					})(),
					{ headers: { "content-type": "application/octet-stream" } },
				),
			),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/bytes`);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("AB");
		});
	});

	it("uses a parsed body instead of reading the request body", async () => {
		const routes = {
			echo: route
				.post("/echo")
				.body(type<string>())
				.handler(({ body }) => body),
		};
		await serve(routes, { handleOptions: { body: "parsed" } }, async (url) => {
			const response = await postJson(`${url}/echo`, "raw");
			expect(await response.json()).toBe("parsed");
		});
		// A framework without a body parser leaves its parsed body undefined.
		await serve(routes, { handleOptions: { body: undefined } }, async (url) => {
			const response = await postJson(`${url}/echo`, "raw");
			expect(await response.json()).toBe("raw");
		});
	});

	it("uses parsed params instead of reading the request URL", async () => {
		const routes = {
			user: route
				.get("/users/:id")
				.params(type<{ id: string }>())
				.handler(({ params }) => params.id),
		};
		await serve(
			routes,
			{ handleOptions: { params: { id: "parsed" } } },
			async (url) => {
				const response = await fetch(`${url}/users/raw`);
				expect(await response.json()).toBe("parsed");
			},
		);
	});

	it("reads chunked request bodies without a content length", async () => {
		const routes = {
			echo: route
				.post("/echo")
				.body(type<{ name: string }>())
				.handler(({ body }) => body.name),
		};
		await serve(routes, {}, async (url) => {
			const encoder = new TextEncoder();
			const response = await fetch(`${url}/echo`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: ReadableStream.from([
					encoder.encode('{"name":'),
					encoder.encode('"Ada"}'),
				]),
				duplex: "half",
			} as RequestInit & { duplex: "half" });
			expect(await response.json()).toBe("Ada");
		});
	});

	it("passes the incoming body and complete content type to custom codecs", async () => {
		const bodyCodecs = [
			bodyCodec("text/csv", {
				deserialize: async (body, contentType) => ({
					text: await body.text(),
					contentType,
				}),
			}),
			bodyCodec("application/x-ndjson", {
				deserialize: async (body) => new Response(body.body).text(),
			}),
		];
		const routes = {
			csv: route
				.post("/csv")
				.headers(type<{ "content-type": "text/csv" }>())
				.body(type<{ text: string; contentType: string }>())
				.handler(({ body }) => body),
			ndjson: route
				.post("/ndjson")
				.headers(type<{ "content-type": "application/x-ndjson" }>())
				.body(type<string>())
				.handler(({ body }) => body),
		};
		await serve(routes, { bodyCodecs }, async (url) => {
			const csv = await fetch(`${url}/csv`, {
				method: "POST",
				headers: { "content-type": "text/csv; header=present" },
				body: "a,b",
			});
			expect(await csv.json()).toEqual({
				text: "a,b",
				contentType: "text/csv; header=present",
			});
			const ndjson = await fetch(`${url}/ndjson`, {
				method: "POST",
				headers: { "content-type": "application/x-ndjson" },
				body: '{"a":1}\n',
			});
			expect(await ndjson.json()).toBe('{"a":1}\n');
		});
	});

	it("rejects a request whose body was read before the route without a parsed body", async () => {
		const routes = {
			echo: route
				.post("/echo")
				.body(type<string>())
				.handler(({ body }) => body),
		};
		await serve(routes, { readBody: true }, async (url) => {
			// The handler promise rejects, which the host turns into a 500,
			// instead of a malformed body response.
			const response = await postJson(`${url}/echo`, "raw");
			expect(response.status).toBe(500);
		});
	});

	it("sends text bodies with characters outside ASCII intact", async () => {
		const text = "Hyvää päivää ✓";
		const routes = {
			json: route.get("/json").handler(() => ({ text })),
			text: route
				.get("/text")
				.handler(() =>
					respond(text, { headers: { "content-type": "text/plain" } }),
				),
			static: route
				.get("/static")
				.static(respond(text, { headers: { "content-type": "text/plain" } })),
		};
		await serve(routes, {}, async (url) => {
			expect(await (await fetch(`${url}/json`)).json()).toEqual({ text });
			expect(await (await fetch(`${url}/text`)).text()).toBe(text);
			expect(await (await fetch(`${url}/static`)).text()).toBe(text);
		});
	});

	it("sends each cookie of a response or an error as its own set-cookie header", async () => {
		const Expired = routeError("SESSION_EXPIRED", { status: 401 });
		const cookies = ["session=abc; HttpOnly", "theme=dark"];
		const routes = {
			inferred: route
				.get("/inferred")
				.handler(({ respond }) => respond("ok", { cookies })),
			defined: route
				.get("/defined")
				.response(type<string>())
				.use(async ({ next }) => {
					const response = await next();
					return {
						...response,
						cookies: [...(response.cookies ?? []), "seen=1"],
					};
				})
				.handler(({ respond }) => respond("ok", { cookies })),
			expired: route
				.get("/expired")
				.error(Expired)
				.handler(({ errors }): string => {
					throw errors.SESSION_EXPIRED({ cookies: ["session=; Max-Age=0"] });
				}),
		};
		await serve(routes, {}, async (url) => {
			const read = async (path: string) =>
				(await fetch(`${url}${path}`)).headers.getSetCookie();
			expect(await read("/inferred")).toEqual(cookies);
			expect(await read("/defined")).toEqual([...cookies, "seen=1"]);
			expect(await read("/expired")).toEqual(["session=; Max-Age=0"]);
		});
	});

	it("sends the headers of a serialized body under the route's headers, content type included", async () => {
		const bodyCodecs = [
			bodyCodec("text/x-custom", {
				serialize: (value) =>
					serializedBody(String(value), {
						headers: { "x-codec": "custom", "x-route": "codec" },
					}),
			}),
		];
		const routes = {
			custom: route.get("/custom").handler(() =>
				respond("value", {
					headers: { "content-type": "text/x-custom", "x-route": "route" },
				}),
			),
		};
		await serve(routes, { bodyCodecs }, async (url) => {
			const response = await fetch(`${url}/custom`);
			expect(response.headers.get("content-type")).toBe("text/x-custom");
			expect(response.headers.get("x-codec")).toBe("custom");
			expect(response.headers.get("x-route")).toBe("route");
			expect(await response.text()).toBe("value");
		});
	});

	it("sends a returned Response with the changes middleware makes", async () => {
		const withRequestId = route.use(async ({ next }) => {
			const response = await next({ context: { format: "xml" } });
			return {
				...response,
				headers: { ...response.headers, "x-request-id": "1" },
			};
		});
		const routes = {
			redirect: withRequestId
				.get("/redirect")
				.handler(() => Response.redirect("https://example.com/next", 302)),
			legacy: withRequestId.get("/legacy").handler(({ context }) => {
				const headers = new Headers({ "content-type": "application/xml" });
				headers.append("set-cookie", "a=1");
				headers.append("set-cookie", "b=2");
				return new Response(`<${context.format} />`, {
					status: 202,
					headers,
				});
			}),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/legacy`);
			expect(response.status).toBe(202);
			expect(response.headers.get("content-type")).toBe("application/xml");
			expect(response.headers.get("x-request-id")).toBe("1");
			expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
			expect(await response.text()).toBe("<xml />");
			const redirect = await fetch(`${url}/redirect`, { redirect: "manual" });
			expect(redirect.status).toBe(302);
			expect(redirect.headers.get("location")).toBe("https://example.com/next");
			expect(redirect.headers.get("x-request-id")).toBe("1");
		});
	});

	it("aborts the request signal when the client disconnects", async () => {
		const { promise: started, resolve: start } = signal();
		const { promise: aborted, resolve: abort } = signal();
		const routes = {
			wait: route.get("/wait").handler(
				({ signal }) =>
					new Promise<string>((resolve) => {
						signal.addEventListener("abort", () => {
							abort();
							resolve("aborted");
						});
						start();
					}),
			),
		};
		await serve(routes, {}, async (url) => {
			const controller = new AbortController();
			const response = fetch(`${url}/wait`, { signal: controller.signal });
			await started;
			controller.abort();
			await expect(response).rejects.toThrow();
			await aborted;
		});
	});

	it("ends a stream's generator when the client disconnects", async () => {
		const { promise: ended, resolve: end } = signal();
		const routes = {
			ticks: route.get("/ticks").handler(async function* () {
				try {
					for (let tick = 0; ; tick += 1) {
						yield tick;
						await new Promise((resolve) => setTimeout(resolve, 5));
					}
				} finally {
					end();
				}
			}),
		};
		await serve(routes, {}, async (url) => {
			const controller = new AbortController();
			const response = await fetch(`${url}/ticks`, {
				signal: controller.signal,
			});
			await response.body!.getReader().read();
			controller.abort();
			await ended;
		});
	});

	it("closes the connection when a stream fails after the response started", async () => {
		const routes = {
			events: route.get("/failing-events").handler(async function* () {
				yield 1;
				throw new Error("stream failed");
			}),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/failing-events`);
			expect(response.status).toBe(200);
			await expect(response.text()).rejects.toThrow();
		});
	});
});

describe("node routes", () => {
	it("matches the full request target when a router strips the mount path", async () => {
		const handler = node.createCatchAllHandler({
			user: route.get("/users/:id").handler(({ params }) => params.id),
		});
		await withHttpServer(
			async (req, res) => {
				// Express keeps the full target in `originalUrl` for `app.use("/api")`.
				Object.assign(req, { originalUrl: req.url, url: req.url!.slice(4) });
				await handler(req, res, { mountPath: "/api" });
			},
			async (url) => {
				const response = await fetch(`${url}/api/users/1`);
				expect(await response.json()).toBe("1");
			},
		);
	});

	it("uses params a router such as Express set on the request", async () => {
		const [user] = node.createRouteHandlers({
			user: route
				.get("/users/:id")
				.params(type<{ id: string }>())
				.handler(({ params }) => params.id),
		});
		const attached = (params: unknown, expected: string) =>
			withHttpServer(
				(req, res) => user!.handle(Object.assign(req, { params }), res),
				async (url) => {
					const response = await fetch(`${url}/users/raw`);
					expect(await response.json()).toBe(expected);
				},
			);
		await attached({ id: "attached" }, "attached");
		// Params of another route, such as a wildcard mount, are not used.
		await attached({}, "raw");
		await attached(undefined, "raw");
	});
});

// Apps

type AppOptions = {
	mountPath?: `/${string}`;
	context?: object | (() => object | Promise<object>);
	/**
	 * `cors` answers preflights and adds `access-control-allow-origin` to every
	 * response, error responses included, `throw` throws before calling
	 * `next`, `limit` throws a `RATE_LIMITED` route error, `route` sends the
	 * matched route's path, or `none`, as `x-route`, and `notFound` sends 404
	 * "custom" for unmatched requests, and `report` is an `onError` that adds
	 * errors to `reported`.
	 */
	interceptors?: readonly (
		| "cors"
		| "throw"
		| "limit"
		| "route"
		| "notFound"
		| "report"
	)[];
};

const reported: unknown[] = [];
const RateLimited = routeError("RATE_LIMITED", { status: 429 });

const fetchInterceptors = {
	cors: interceptor(async ({ request, next }) => {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: { "access-control-allow-origin": "*" },
			});
		}
		const response = await next().catch(errorResponse);
		const headers = new Headers(response.headers);
		headers.set("access-control-allow-origin", "*");
		return new Response(response.body, { status: response.status, headers });
	}),
	throw: interceptor(() => {
		throw new Error("interceptor failed");
	}),
	limit: interceptor(() => {
		throw new RateLimited();
	}),
	route: interceptor(async ({ next, route }) => {
		const response = await next().catch(errorResponse);
		const headers = new Headers(response.headers);
		headers.set("x-route", route?.path ?? "none");
		return new Response(response.body, { status: response.status, headers });
	}),
	notFound: interceptor(({ route, next }) =>
		route ? next() : new Response("custom", { status: 404 }),
	),
	report: onError((error) => void reported.push(error)),
};

const nodeInterceptors = {
	cors: node.interceptor(({ request, response, next }) => {
		response.setHeader("access-control-allow-origin", "*");
		if (request.method !== "OPTIONS") return next();
		response.writeHead(204).end();
	}),
	throw: node.interceptor(() => {
		throw new Error("interceptor failed");
	}),
	limit: node.interceptor(() => {
		throw new RateLimited();
	}),
	route: node.interceptor(({ response, next, route }) => {
		response.setHeader("x-route", route?.path ?? "none");
		return next();
	}),
	notFound: node.interceptor(({ response, route, next }) => {
		if (route) return next();
		response.writeHead(404).end("custom");
	}),
	report: node.onError((error) => void reported.push(error)),
};

type ServeApp = (
	routes: RuntimeImplementationTree,
	options: AppOptions,
	run: (url: string) => Promise<void>,
) => Promise<void>;

const serveFetchApp: ServeApp = (routes, options, run) => {
	// The cases use initial context that the generic route tree type omits.
	const app = createApp(routes, {
		mountPath: options.mountPath,
		context: options.context,
		interceptors: options.interceptors?.map((name) => fetchInterceptors[name]),
	} as never);
	return withFetchServer((request) => app.fetch(request), run);
};

const serveNodeApp: ServeApp = (routes, options, run) =>
	withHttpServer(
		node.createApp(routes, {
			mountPath: options.mountPath,
			context: options.context,
			interceptors: options.interceptors?.map((name) => nodeInterceptors[name]),
		} as never),
		run,
	);

describe.each([
	{ name: "fetch", serve: serveFetchApp },
	{ name: "node", serve: serveNodeApp },
])("$name app conformance", ({ serve }) => {
	const user = route
		.get("/users/:id")
		.params(type<{ id: string }>())
		.handler(({ params }) => params.id);

	it("serves routes under the mount path and sends NOT_FOUND outside it", async () => {
		const root = route.get("/").handler(() => "root");
		for (const mountPath of ["/api", "/api/"] as const) {
			await serve({ root, user }, { mountPath }, async (url) => {
				expect(await (await fetch(`${url}/api`)).json()).toBe("root");
				expect(await (await fetch(`${url}/api/users/1`)).json()).toBe("1");
				const missing = await fetch(`${url}/users/1`);
				expect(missing.status).toBe(404);
				expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
			});
		}
	});

	it("sends an interceptor's response for unmatched requests", async () => {
		await serve({ user }, { interceptors: ["notFound"] }, async (url) => {
			const missing = await fetch(`${url}/missing`);
			expect(missing.status).toBe(404);
			expect(await missing.text()).toBe("custom");
			expect(await (await fetch(`${url}/users/1`)).json()).toBe("1");
		});
	});

	it("seeds the context from a value or a function", async () => {
		const me = route
			.$context<{ user: string }>()
			.get("/me")
			.handler(({ context }) => context.user);
		for (const context of [
			{ user: "Ada" },
			() => ({ user: "Ada" }),
			async () => ({ user: "Ada" }),
		]) {
			await serve({ me }, { context }, async (url) => {
				expect(await (await fetch(`${url}/me`)).json()).toBe("Ada");
			});
		}
	});

	it("sends errors the routes do not handle as internal server errors", async () => {
		const failure = new Error("handler failed");
		const routes = {
			fail: route.get("/fail").handler((): string => {
				throw failure;
			}),
			failContext: route
				.$context<{ user: string }>()
				.get("/context")
				.handler(({ context }) => context.user),
		};
		const context = () => {
			throw failure;
		};
		await serve(routes, { context }, async (url) => {
			for (const path of ["fail", "context"]) {
				const response = await fetch(`${url}/${path}`);
				expect(response.status).toBe(500);
				expect(await response.json()).toMatchObject({
					code: "INTERNAL_SERVER_ERROR",
				});
			}
		});
	});

	it("runs interceptors before routing, around every response", async () => {
		const fail = route.get("/fail").handler((): string => {
			throw new Error("handler failed");
		});
		await serve({ user, fail }, { interceptors: ["cors"] }, async (url) => {
			const preflight = await fetch(`${url}/users/1`, { method: "OPTIONS" });
			expect(preflight.status).toBe(204);
			for (const [path, status] of [
				["users/1", 200],
				["missing", 404],
				["fail", 500],
			] as const) {
				const response = await fetch(`${url}/${path}`);
				expect(response.status).toBe(status);
				expect(response.headers.get("access-control-allow-origin")).toBe("*");
			}
			expect(await (await fetch(`${url}/users/1`)).json()).toBe("1");
		});
	});

	it("passes the matched route to interceptors, which static routes skip", async () => {
		const about = route.get("/about").static("about");
		await serve(
			{ user, about },
			{ interceptors: ["route"], mountPath: "/api" },
			async (url) => {
				for (const [path, header] of [
					["api/users/1", "/users/:id"],
					["api/missing", "none"],
					["api/about", null],
				] as const) {
					const response = await fetch(`${url}/${path}`);
					expect(response.headers.get("x-route")).toBe(header);
				}
			},
		);
	});

	it("rejects next() with every error, route errors as they are sent", async () => {
		const failure = new Error("handler failed");
		const Gone = routeError("GONE", { status: 410 });
		const routes = {
			fail: route.get("/fail").handler((): string => {
				throw failure;
			}),
			invalid: route
				.get("/invalid")
				.response(invalid)
				.handler(() => respond("unchecked")),
			gone: route
				.get("/gone")
				.error(Gone)
				.handler((): string => {
					throw new Gone();
				}),
		};
		reported.length = 0;
		await serve(routes, { interceptors: ["report"] }, async (url) => {
			const response = await fetch(`${url}/fail`);
			expect(response.status).toBe(500);
			expect(await response.json()).toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
			});
			expect((await fetch(`${url}/invalid`)).status).toBe(500);
			expect((await fetch(`${url}/gone`)).status).toBe(410);
			expect((await fetch(`${url}/missing`)).status).toBe(404);
		});
		expect(reported).toEqual([
			failure,
			expect.objectContaining({
				code: "INTERNAL_SERVER_ERROR",
				cause: expect.objectContaining({ location: "body" }),
			}),
			expect.any(Gone),
			expect.objectContaining({ code: "NOT_FOUND" }),
		]);
	});

	it("sends route errors interceptors throw with their status", async () => {
		await serve({ user }, { interceptors: ["cors", "limit"] }, async (url) => {
			const response = await fetch(`${url}/users/1`);
			expect(response.status).toBe(429);
			expect(response.headers.get("access-control-allow-origin")).toBe("*");
			expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
		});
	});

	it("reports a response body that fails while it streams", async () => {
		const failure = new Error("stream failed");
		const routes = {
			stream: route.get("/stream").handler(
				() =>
					new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(new TextEncoder().encode("partial"));
								controller.error(failure);
							},
						}),
					),
			),
		};
		reported.length = 0;
		await serve(routes, { interceptors: ["report"] }, async (url) => {
			await expect(
				fetch(`${url}/stream`).then((response) => response.text()),
			).rejects.toThrow();
		});
		await vi.waitFor(() => expect(reported).toEqual([failure]));
	});

	it("sends errors interceptors throw as internal server errors", async () => {
		await serve({ user }, { interceptors: ["cors", "throw"] }, async (url) => {
			const response = await fetch(`${url}/users/1`);
			expect(response.status).toBe(500);
			expect(await response.json()).toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
			});
		});
	});
});
