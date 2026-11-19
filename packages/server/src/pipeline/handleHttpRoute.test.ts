import {
	bodyCodec,
	createClient,
	routeError,
	serializedBody,
	sse,
	sseFormat,
	type,
} from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { route } from "../builder/routeBuilder.ts";
import type { RuntimeImplementationTree } from "../routing/match.ts";
import { createRouteHandlers } from "../fetch/createRouteHandlers.ts";
import { createApp, type CreateAppOptions } from "../fetch/createApp.ts";
import { respond } from "./respond.ts";
import { sseEvent } from "./sse.ts";

const rejected: StandardSchemaV1<unknown, Record<string, string>> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid" }] }),
	},
};

// Serves one route at `/` and sends one request to it.
const send = (
	implementation: RuntimeImplementationTree,
	init?: RequestInit,
	options?: CreateAppOptions<[], object>,
) =>
	createApp({ route: implementation }, options as never).fetch(
		new Request("http://localhost/", init),
	);

describe("route pipeline", () => {
	it("passes the host context and injected values to middleware and the handler", async () => {
		const implementation = route
			.$context<{ count: number }>()
			.use(({ context, next }) =>
				next({ context: { count: context.count + 1, step: "outer" } }),
			)
			.get("/")
			.use(({ context, next }) =>
				next({ context: { count: context.count + 1 } }),
			)
			.handler(({ context }) => context);
		for (const count of [0, 5]) {
			const response = await send(implementation, undefined, {
				context: { count },
			});
			expect(await response.json()).toEqual({
				count: count + 2,
				step: "outer",
			});
		}
	});

	it("passes the defined errors to middleware and the handler", async () => {
		const Gone = routeError("GONE", { status: 410, data: type<number>() });
		const implementation = route
			.get("/")
			.error(Gone)
			.use(({ errors, next }) => {
				expect(errors.GONE({ data: 1 })).toBeInstanceOf(Gone);
				return next();
			})
			.handler(({ errors }): string => {
				throw errors.GONE({ data: 2, message: "Gone" });
			});
		const response = await send(implementation);
		expect(response.status).toBe(410);
		expect(await response.json()).toEqual({
			code: "GONE",
			message: "Gone",
			data: 2,
		});
	});

	it("rejects invalid requests without invoking the handler", async () => {
		const handler = vi.fn(() => "ok");
		const response = await send(
			route.post("/").body(rejected).handler(handler),
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			},
		);
		expect(response.status).toBe(400);
		expect(handler).not.toHaveBeenCalled();
	});

	it("decodes request bodies with custom codecs before the defaults", async () => {
		const implementation = route
			.post("/")
			.body(type<string>())
			.handler(({ body }) => body);
		const response = await send(
			implementation,
			{
				method: "POST",
				headers: { "content-type": "application/json; charset=utf-8" },
				body: '{"value":"decoded"}',
			},
			{
				bodyCodecs: [
					{
						mediaTypes: ["application/json"],
						deserialize: async (body) =>
							(JSON.parse(await body.text()) as { value: string }).value,
					},
				],
			},
		);
		expect(await response.json()).toBe("decoded");
	});

	it("decodes request bodies with the content type the headers declare, and JSON otherwise", async () => {
		const seen = vi.fn();
		const declared = route
			.post("/")
			.headers(
				type(
					(headers: { "content-type": "text/plain" | "application/json" }) =>
						headers,
				),
			)
			.body(
				type((value: string | { name: string }) =>
					typeof value === "string" ? value.toUpperCase() : value.name,
				),
			)
			.handler(({ headers, body }) => {
				seen(headers["content-type"], body);
			});
		// Headers schemas see the media type without its parameters.
		await send(declared, {
			method: "POST",
			headers: { "content-type": "text/plain; charset=utf-8" },
			body: "ada",
		});
		await send(declared, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: '{"name":"Grace"}',
		});
		expect(seen.mock.calls).toEqual([
			["text/plain", "ADA"],
			["application/json", "Grace"],
		]);

		const json = route
			.post("/")
			.body(type<{ name: string }>())
			.handler(({ body }) => body.name);
		const text = await send(json, {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: "Ada",
		});
		expect(text.status).toBe(415);
	});

	it("receives and sends FormData without a declared content type", async () => {
		const routes = {
			echo: route
				.post("/echo")
				.body(type<FormData>())
				.handler(({ body, respond }) => respond(body)),
		};
		const app = createApp(routes);
		const client = createClient(routes, {
			origin: "http://localhost",
			fetch: app.fetch,
		});
		const form = new FormData();
		form.append("name", "Ada");
		const { status, body } = await client.echo({ body: form });
		expect(status).toBe(200);
		expect(body.get("name")).toBe("Ada");
	});

	it("sends transformed defined bodies and headers unless response validation is disabled", async () => {
		const implementation = route
			.get("/")
			.response(
				type((value: string) => Number(value)),
				{
					headers: type((value: { count: number }) => ({
						count: value.count + 1,
					})),
				},
			)
			.handler(() => respond("2", { headers: { count: 2 } }));
		for (const [disableResponseValidation, body, count] of [
			[false, 2, "3"],
			[true, "2", "2"],
		] as const) {
			const response = await send(implementation, undefined, {
				disableResponseValidation,
			});
			expect(response.headers.get("count")).toBe(count);
			expect(await response.json()).toBe(body);
		}
	});

	it("validates plain bodies and respond() results of defined responses", async () => {
		const schema = type((value: string) => value.toUpperCase());
		for (const [implementation, status] of [
			[
				route
					.get("/")
					.response(schema)
					.handler(() => respond("hello")),
				200,
			],
			[
				route
					.get("/")
					.response(schema)
					.handler(() => "hello"),
				200,
			],
			[
				route
					.get("/")
					.response(schema, { status: 201 })
					.handler(() => "hello"),
				201,
			],
		] as const) {
			const response = await send(implementation);
			expect(response.status).toBe(status);
			expect(await response.json()).toBe("HELLO");
		}
	});

	it.each(["body", "headers"] as const)(
		"sends defined %s validation failures as internal server errors",
		async (location) => {
			const implementation = route
				.get("/")
				.response(
					location === "body" ? rejected : type<string>(),
					location === "headers" ? { headers: rejected } : {},
				)
				.handler(() => respond("ok", { headers: {} }));
			const response = await send(implementation);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				code: "INTERNAL_SERVER_ERROR",
				message: expect.any(String),
			});
		},
	);

	it("passes respond to middleware to end the chain", async () => {
		const implementation = route
			.get("/")
			.headers(type<{ "if-none-match"?: string }>())
			.response(type<string>())
			.response({ status: 204 })
			.use(async ({ headers, respond, next }) =>
				headers["if-none-match"] === "v1"
					? respond(undefined, { status: 204 })
					: next(),
			)
			.handler(({ respond }) => respond("fresh"));
		const cached = await send(implementation, {
			headers: { "if-none-match": "v1" },
		});
		expect(cached.status).toBe(204);
		expect(await cached.text()).toBe("");
		const fresh = await send(implementation);
		expect(await fresh.json()).toBe("fresh");
	});

	it("validates defined stream items as they are sent", async () => {
		const implementation = route
			.get("/")
			.response(sse(type((value: string) => Number(value))))
			.handler(() =>
				respond(
					(async function* () {
						yield "2";
					})(),
				),
			);
		for (const [disableResponseValidation, frame] of [
			[false, "data: 2\n\n"],
			[true, 'data: "2"\n\n'],
		] as const) {
			const response = await send(implementation, undefined, {
				disableResponseValidation,
			});
			expect(await response.text()).toBe(frame);
		}
	});

	it("sends inferred streams as SSE with their status and headers", async () => {
		const response = await send(
			route.get("/").handler(() =>
				respond(
					(async function* () {
						yield sseEvent(1, { id: "one" });
					})(),
					{ status: 201, headers: { count: 1 } },
				),
			),
		);
		expect(response.status).toBe(201);
		expect(response.headers.get("count")).toBe("1");
		expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
		expect(await response.text()).toBe("id: one\ndata: 1\n\n");
	});

	it("sends streams with cache-control: no-cache unless the handler sets it", async () => {
		const stream = async function* () {
			yield 1;
		};
		const byDefault = await send(route.get("/").handler(stream));
		expect(byDefault.headers.get("cache-control")).toBe("no-cache");
		const overridden = await send(
			route
				.get("/")
				.handler(() =>
					respond(stream(), { headers: { "cache-control": "no-store" } }),
				),
		);
		expect(overridden.headers.get("cache-control")).toBe("no-store");
	});

	it("passes headers sent with a body to the codec that reads it", async () => {
		const bytes = bodyCodec("application/octet-stream", {
			serialize: (value) =>
				value instanceof Uint8Array
					? serializedBody(value, { headers: { "x-body": "bytes" } })
					: (value as Blob),
			deserialize: async (body, headers) =>
				headers["x-body"] === "bytes"
					? new Uint8Array(await body.arrayBuffer())
					: body.blob(),
		});
		const routes = {
			echo: route
				.post("/")
				.headers(
					type(
						(headers: { "content-type": "application/octet-stream" }) =>
							headers,
					),
				)
				.body(type((body: Uint8Array) => body))
				.handler(({ body }) =>
					respond(body, {
						headers: { "content-type": "application/octet-stream" },
					}),
				),
		};
		const app = createApp(routes, { bodyCodecs: [bytes] });
		const client = createClient(routes, {
			origin: "http://localhost",
			fetch: app.fetch,
			bodyCodecs: [bytes],
		});
		const { body } = await client.echo({
			headers: { "content-type": "application/octet-stream" },
			body: new Uint8Array([1, 2]),
		});
		expect(body).toEqual(new Uint8Array([1, 2]));
	});

	it("lets the codec that sends a result read and replace its headers", async () => {
		const attachments = bodyCodec("application/pdf", {
			serialize: (value, headers) =>
				value instanceof File && headers["content-disposition"] === "attachment"
					? serializedBody(value, {
							headers: {
								"content-disposition": `attachment; filename="${value.name}"`,
							},
						})
					: (value as Blob),
		});
		const file = new File(["%PDF"], "post.pdf");
		const download = (headers: Record<string, string>) =>
			send(
				route.get("/").handler(() =>
					respond(file, {
						headers: { "content-type": "application/pdf", ...headers },
					}),
				),
				undefined,
				{ bodyCodecs: [attachments] },
			);
		expect(
			(await download({ "content-disposition": "attachment" })).headers.get(
				"content-disposition",
			),
		).toBe('attachment; filename="post.pdf"');
		expect(
			(await download({ "content-disposition": "inline" })).headers.get(
				"content-disposition",
			),
		).toBe("inline");
	});

	it("sends and reads events with a custom data format", async () => {
		const lines = sseFormat({
			serialize: (data: string[]) => data.join("\n"),
			deserialize: (data) => data.split("\n"),
		});
		const routes = {
			events: route.get("/").handler(async function* () {
				yield ["first", "second"];
			}),
		};
		const app = createApp(routes, { sse: { format: lines } });
		const client = createClient(routes, {
			origin: "http://localhost",
			fetch: app.fetch,
			sse: { format: lines },
		});
		const { body } = await client.events();
		const events = [];
		for await (const event of body) events.push(event);
		expect(events).toEqual([{ data: ["first", "second"] }]);
	});

	it("sends a keepalive comment after the stream is idle", async () => {
		vi.useFakeTimers();
		try {
			let resolve!: (value: number) => void;
			const next = new Promise<number>((settle) => {
				resolve = settle;
			});
			const response = await send(
				route.get("/").handler(async function* () {
					yield await next;
				}),
				undefined,
				{ sse: { keepAlive: 1_000 } },
			);
			const reader = response
				.body!.pipeThrough(new TextDecoderStream())
				.getReader();
			const first = reader.read();
			await vi.advanceTimersByTimeAsync(1_000);
			expect((await first).value).toBe(": keepalive\n\n");
			resolve(1);
			expect((await reader.read()).value).toBe("data: 1\n\n");
		} finally {
			vi.useRealTimers();
		}
	});

	it("sends an initial comment unless the response overrides it", async () => {
		const stream = async function* () {
			yield 1;
		};
		const options = { sse: { initialComment: true } };
		const byDefault = await send(
			route.get("/").handler(stream),
			undefined,
			options,
		);
		expect(await byDefault.text()).toBe(": ok\n\ndata: 1\n\n");
		const overridden = await send(
			route
				.get("/")
				.handler(() => respond(stream(), { sse: { initialComment: false } })),
			undefined,
			options,
		);
		expect(await overridden.text()).toBe("data: 1\n\n");
	});

	it("sends an undefined result without a body", async () => {
		const response = await send(route.get("/").handler(() => undefined));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});

	it.each([null, "hello", 42, { contentType: "text/plain" }, { status: 204 }])(
		"sends other inferred results as JSON, such as %j",
		async (value) => {
			const response = await send(route.get("/").handler(() => value));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(value);
		},
	);

	it("sends inferred 2xx statuses with their content type and headers", async () => {
		const response = await send(
			route.get("/").handler(() =>
				respond("hello", {
					status: 299,
					headers: { "content-type": "text/plain", count: 2 },
				}),
			),
		);
		expect(response.status).toBe(299);
		expect(response.headers.get("content-type")).toBe("text/plain");
		expect(response.headers.get("count")).toBe("2");
		expect(await response.text()).toBe("hello");
	});

	it.each([199, 300, 404])(
		"rejects the inferred status %s outside 2xx",
		async (status) => {
			const [compiled] = createRouteHandlers({
				route: route.get("/").handler(() => respond(undefined, { status })),
			});
			await expect(
				compiled!.handle(new Request("http://localhost/")),
			).rejects.toThrow();
		},
	);

	it("sends the content type of a FormData body over one passed in headers", async () => {
		const response = await send(
			route.get("/").handler(() => {
				const body = new FormData();
				body.set("name", "Ada");
				return respond(body, { headers: { "content-type": "text/plain" } });
			}),
		);
		expect((await response.formData()).get("name")).toBe("Ada");
	});

	it("rejects with ordinary handler errors", async () => {
		const error = new Error("handler failed");
		const [compiled] = createRouteHandlers({
			route: route.get("/").handler((): string => {
				throw error;
			}),
		});
		await expect(
			compiled!.handle(new Request("http://localhost/")),
		).rejects.toBe(error);
	});
});
