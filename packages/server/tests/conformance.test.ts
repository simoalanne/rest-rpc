import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import {
	compileRoutes,
	createCatchAllHandler,
	route,
	type,
	type CatchAllHandleOptions,
} from "@rest-rpc/server";
import * as nodeAdapter from "@rest-rpc/server/node";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
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

const withFetchServer = (
	handler: (request: Request) => Response | Promise<Response>,
	run: (url: string) => Promise<void>,
) =>
	withHttpServer(async (req, res) => {
		try {
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
			const headers = new Headers();
			for (const [name, value] of Object.entries(req.headers)) {
				if (value !== undefined)
					headers.set(name, Array.isArray(value) ? value.join(", ") : value);
			}
			const response = await handler(
				new Request(`http://${req.headers.host}${req.url}`, {
					method: req.method,
					headers,
					body: chunks.length ? Buffer.concat(chunks) : undefined,
				}),
			);
			res.writeHead(response.status, Object.fromEntries(response.headers));
			res.end(Buffer.from(await response.arrayBuffer()));
		} catch (error) {
			res.statusCode = 500;
			res.end(String(error));
		}
	}, run);

// Adapters

type ServeOptions = {
	customValidationHandlers?: boolean;
	handleOptions?: CatchAllHandleOptions;
};

type Serve = (
	routes: RuntimeImplementationTree,
	options: ServeOptions,
	run: (url: string) => Promise<void>,
) => Promise<void>;

const serveFetch: Serve = (routes, options, run) => {
	const handler = createCatchAllHandler(
		compileRoutes(routes, {
			...(options.customValidationHandlers && {
				requestValidationErrorHandler: () =>
					Response.json({ handled: "request" }, { status: 422 }),
				responseValidationErrorHandler: () =>
					Response.json({ handled: "response" }, { status: 502 }),
			}),
		}),
	);
	return withFetchServer(
		async (request) =>
			(await handler(request, options.handleOptions)).response ??
			new Response("unmatched", { status: 404 }),
		run,
	);
};

const serveNode: Serve = (routes, options, run) => {
	const handler = nodeAdapter.createCatchAllHandler(
		nodeAdapter.compileRoutes(routes, {
			...(options.customValidationHandlers && {
				requestValidationErrorHandler: () =>
					Response.json({ handled: "request" }, { status: 422 }),
				responseValidationErrorHandler: () =>
					Response.json({ handled: "response" }, { status: 502 }),
			}),
		}),
	);
	return withHttpServer(async (req, res) => {
		try {
			if (!(await handler(req, res, options.handleOptions)).matched) {
				res.statusCode = 404;
				res.end("unmatched");
			}
		} catch {
			res.destroy();
		}
	}, run);
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
		.handler(() => ({ status: 204 })),
	response: route
		.get("/invalid-response")
		.response(invalid)
		.handler(() => ({ status: 200, body: "unchecked" })),
};

const postJson = (url: string, body: unknown) =>
	fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

// Cases every adapter must handle the same way.

describe.each([
	{ name: "fetch", serve: serveFetch },
	{ name: "node", serve: serveNode },
])("$name adapter conformance", ({ serve }) => {
	it("serves params, body, headers and the request signal under a mount path", async () => {
		const routes = {
			create: route
				.post("/users/{id}")
				.params(type<{ id: string }>())
				.body(type<{ name: string }>())
				.handler(({ params, body, signal }) => {
					expect(signal).toBeInstanceOf(AbortSignal);
					return {
						status: 201,
						body: { id: params.id, name: body.name },
						headers: { "x-route": "create", "x-count": 1 },
					};
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
			post: route
				.get("/users/:id/posts/{slug}")
				.handler(({ params }) => params),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/users/1/posts/a%20b`);
			expect(await response.json()).toEqual({ id: "1", slug: "a b" });
		});
	});

	it("serves prefixed tree-derived routes with params from the prefix", async () => {
		const routes = {
			todos: route
				.prefix("/tenants/:tenant")
				.get()
				.handler(({ params }) => params),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/tenants/acme/todos`);
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
		const handler = vi.fn(() => ({ status: 204 as const }));
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
				message: "Unsupported request body content type.",
			});
			expect(handler).not.toHaveBeenCalled();
		});
	});

	it("ignores the request body of routes without a body schema", async () => {
		const handler = vi.fn(() => ({ status: 204 as const }));
		const routes = { ping: route.post("/ping").handler(handler) };
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/ping`, {
				method: "POST",
				headers: { "content-type": "text/plain" },
				body: "Ada",
			});
			expect(response.status).toBe(204);
			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({ body: undefined, contentType: undefined }),
			);
		});
	});

	it("answers validation errors with the default responses", async () => {
		await serve(validationRoutes, {}, async (url) => {
			const request = await postJson(`${url}/invalid-request`, {});
			expect(request.status).toBe(400);
			expect(await request.json()).toMatchObject({
				validationErrors: { body: [{ message: "invalid value" }] },
			});
			const response = await fetch(`${url}/invalid-response`);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				message: "Response validation failed.",
			});
		});
	});

	it("answers validation errors with custom handlers", async () => {
		await serve(
			validationRoutes,
			{ customValidationHandlers: true },
			async (url) => {
				const request = await postJson(`${url}/invalid-request`, {});
				expect(request.status).toBe(422);
				expect(await request.json()).toEqual({ handled: "request" });
				const response = await fetch(`${url}/invalid-response`);
				expect(response.status).toBe(502);
				expect(await response.json()).toEqual({ handled: "response" });
			},
		);
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
				.streamResponse(type<number>(), {
					headers: type<{ "x-stream-id": string }>(),
				})
				.handler(() => ({
					status: 200,
					body: (async function* () {
						yield 1;
					})(),
					headers: { "x-stream-id": "stream_1" },
				})),
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
				.streamResponse(invalid)
				.handler(() => ({
					status: 200,
					body: (async function* () {
						yield "unchecked";
					})(),
				})),
		};
		await serve(routes, {}, async (url) => {
			// Adapters differ in whether status and headers are already committed
			// or the connection closes, but none may deliver the invalid event.
			const text = await fetch(`${url}/invalid-events`)
				.then((response) => response.text())
				.catch(() => "");
			expect(text).not.toContain("unchecked");
		});
	});

	it("sends bodiless responses without a body", async () => {
		const routes = {
			inferred: route.delete("/inferred").handler(() => ({ status: 204 })),
			declared: route
				.delete("/declared")
				.response({ status: 204 })
				.handler(() => ({ status: 204 })),
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
				.body({
					"application/json": type<unknown>(),
					"application/x-www-form-urlencoded": type<URLSearchParams>(),
					"multipart/form-data": type<FormData>(),
					"text/plain": type<string>(),
					"application/octet-stream": type<Blob>(),
				})
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
				return { status: 200, contentType: "multipart/form-data", body };
			}),
		};
		await serve(routes, {}, async (url) => {
			const response = await fetch(`${url}/form`);
			expect(response.status).toBe(200);
			expect((await response.formData()).get("name")).toBe("Ada");
		});
	});

	it("streams binary response bodies", async () => {
		const routes = {
			bytes: route.get("/bytes").handler(() => ({
				status: 200,
				contentType: "application/octet-stream",
				body: (async function* () {
					yield new TextEncoder().encode("A");
					yield new TextEncoder().encode("B");
				})(),
			})),
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
	});

	it("uses parsed params instead of reading the request URL", async () => {
		const routes = {
			user: route
				.get("/users/{id}")
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
});

describe("node adapter", () => {
	it("matches the full request target when a router strips the mount path", async () => {
		const handler = nodeAdapter.createCatchAllHandler(
			nodeAdapter.compileRoutes({
				user: route.get("/users/:id").handler(({ params }) => params.id),
			}),
		);
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
		const [user] = nodeAdapter.compileRoutes({
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
