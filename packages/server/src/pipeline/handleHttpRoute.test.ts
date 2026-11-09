import { routeError, type } from "@rest-rpc/core";
import {
	handleHttpRoute,
	normalizeImplicitResponse,
} from "./handleHttpRoute.ts";
import { sse } from "./sse.ts";
import {
	flattenRouteImplementations,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import { route } from "../builder/routeBuilder.ts";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";

const rejected: StandardSchemaV1<unknown, Record<string, string>> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid" }] }),
	},
};

const signal = new AbortController().signal;

const execute = (implementation: RuntimeImplementationTree) => {
	const flattened = flattenRouteImplementations(implementation)[0]!;
	return handleHttpRoute(flattened, {
		request: {},
		signal,
		mediaType: flattened.defaultBodyMediaType,
	});
};

describe("handleHttpRoute", () => {
	it("shares context with middleware and creates a fresh store per request", async () => {
		const contexts: unknown[] = [];
		const implementation = route
			.$context<{ count: number }>()
			.use(({ context, next }) => {
				contexts.push(context);
				context.set("count", 1);
				return next();
			})
			.get("/")
			.use(({ context, next }) => {
				expect(context).toBe(contexts.at(-1));
				context.set("count", context.get("count") + 1);
				return next();
			})
			.handler(({ context }) => context.get("count"));
		expect(await execute(implementation)).toMatchObject({ body: { value: 2 } });
		expect(await execute(implementation)).toMatchObject({ body: { value: 2 } });
		expect(contexts[0]).not.toBe(contexts[1]);
	});

	it("passes factories of the defined errors to middleware and the handler", async () => {
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
		await expect(async () => execute(implementation)).rejects.toMatchObject({
			code: "GONE",
			status: 410,
			message: "Gone",
			data: 2,
		});
	});

	it("rejects invalid requests without invoking the handler", async () => {
		const handler = vi.fn(() => "ok");
		const implementation = route.post("/").body(rejected).handler(handler);
		await expect(async () => execute(implementation)).rejects.toMatchObject({
			code: "REQUEST_VALIDATION_FAILED",
		});
		expect(handler).not.toHaveBeenCalled();
	});

	it("transforms defined bodies and headers unless response validation is disabled", async () => {
		const implementation = route
			.get("/")
			.response(
				type((value: string) => Number(value)),
				{
					headers: type((value: { count: number; omitted?: string }) => ({
						count: value.count + 1,
						omitted: undefined,
					})),
				},
			)
			.handler(() => ({
				status: 200,
				body: "2",
				headers: { count: 2 },
			}));
		const run = (disableResponseValidation: boolean) =>
			handleHttpRoute(flattenRouteImplementations(implementation)[0]!, {
				request: {},
				signal,
				disableResponseValidation,
			});
		expect(await run(false)).toMatchObject({
			headers: { count: 3 },
			body: { value: 2 },
		});
		expect(await run(true)).toMatchObject({
			headers: { count: 2 },
			body: { value: "2" },
		});
	});

	it.each(["body", "headers"] as const)(
		"rejects defined %s validation failures",
		async (location) => {
			const implementation = route
				.get("/")
				.response(
					location === "body" ? rejected : type<string>(),
					location === "headers" ? { headers: rejected } : {},
				)
				.handler(() => ({ status: 200, body: "ok", headers: {} }));
			await expect(async () => execute(implementation)).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				cause: { location },
			});
		},
	);

	it("validates defined stream chunks lazily", async () => {
		async function* chunks() {
			yield "2";
		}
		const implementation = route
			.get("/")
			.streamResponse(type((value: string) => Number(value)))
			.handler(() => ({ status: 200, body: chunks() }));
		for (const disabled of [false, true]) {
			const result = await handleHttpRoute(
				flattenRouteImplementations(implementation)[0]!,
				{
					request: {},
					signal,
					disableResponseValidation: disabled,
				},
			);
			if (!("body" in result)) throw new Error("Expected stream");
			const frames = [];
			for await (const frame of result.body!.value as AsyncIterable<string>)
				frames.push(frame);
			expect(frames).toEqual([disabled ? 'data: "2"\n\n' : "data: 2\n\n"]);
		}
	});

	it("frames inferred streams as SSE and preserves headers", async () => {
		async function* values() {
			yield sse({ data: 1, id: "one" });
		}
		const result = await execute(
			route.get("/").handler(() => ({
				status: 201,
				body: values(),
				headers: { count: 1 },
			})),
		);
		if (!("body" in result)) throw new Error("Expected stream");
		expect(result).toMatchObject({
			status: 201,
			headers: { count: 1 },
			body: { contentType: "text/event-stream" },
		});
		const frames = [];
		for await (const frame of result.body!.value as AsyncIterable<string>)
			frames.push(frame);
		expect(frames).toEqual(["id: one\ndata: 1\n\n"]);
	});

	it("reports route errors that end a started stream", async () => {
		async function* values() {
			yield "bad";
		}
		const onStreamError = vi.fn();
		const result = await handleHttpRoute(
			flattenRouteImplementations(
				route
					.get("/")
					.streamResponse(rejected)
					.handler(() => ({ status: 200, body: values() })),
			)[0]!,
			{ request: {}, signal, onStreamError },
		);
		const frames = result.body!.value as AsyncIterable<string>;
		await expect(async () => {
			for await (const _ of frames);
		}).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(onStreamError).toHaveBeenCalledWith(
			expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
		);
	});

	it("dispatches defined envelopes and plain bodies through response validation", async () => {
		const schema = type((value: string) => value.toUpperCase());
		expect(
			await execute({
				get: route
					.response(schema)
					.handler(() => ({ status: 200, body: "hello" })),
			}),
		).toMatchObject({
			status: 200,
			body: { value: "HELLO", contentType: "application/json" },
		});
		expect(
			await execute({ get: route.response(schema).handler(() => "hello") }),
		).toMatchObject({
			status: 200,
			body: { value: "HELLO", contentType: "application/json" },
		});
		expect(
			await execute({
				post: route.response(schema, { status: 201 }).handler(() => "hello"),
			}),
		).toMatchObject({
			status: 201,
			body: { value: "HELLO", contentType: "application/json" },
		});
	});
	it("rejects an unknown response status even with response validation disabled", async () => {
		const defined = route
			.get("/")
			.response(type<string>())
			.handler(() => ({ status: 200, body: "ok" }));
		const implementation = {
			...flattenRouteImplementations(defined)[0]!,
			handler: () => ({ status: 404, body: "missing" }),
		};
		await expect(async () =>
			handleHttpRoute(implementation, {
				request: {},
				signal,
				disableResponseValidation: true,
			}),
		).rejects.toThrow("returned status 404, which it does not define");
	});

	it("requires a defined response content type and normalizes the selection", async () => {
		const defined = route
			.get("/")
			.response({
				"text/plain": type<string>(),
				"text/html": type((value: string) => `<p>${value}</p>`),
			})
			.handler(() => ({ status: 200, body: "ok", contentType: "text/plain" }));
		const implementation = flattenRouteImplementations(defined)[0]!;
		const run = (contentType?: string) =>
			handleHttpRoute(
				{
					...implementation,
					handler: () => ({ status: 200, body: "ok", contentType }),
				},
				{ request: {}, signal },
			);
		expect(await run("Text/Plain; charset=utf-8")).toMatchObject({
			body: { value: "ok", contentType: "text/plain" },
		});
		expect(await run("text/html")).toMatchObject({
			body: { value: "<p>ok</p>", contentType: "text/html" },
		});
		await expect(async () => run()).rejects.toThrow(
			"Unsupported response body contentType.",
		);
		await expect(async () => run("application/json")).rejects.toThrow(
			"Unsupported response body contentType.",
		);
	});

	it("validates the request body with the schemas of the selected media type", async () => {
		const seen = vi.fn();
		const defined = route
			.post("/")
			.body({
				"text/plain": type((value: string) => value.toUpperCase()),
				"application/json": type((value: { name: string }) => value.name),
			})
			.handler(({ contentType, body }) => {
				seen(contentType, body);
				return { status: 204 };
			});
		const implementation = flattenRouteImplementations(defined)[0]!;
		const run = (mediaType: string, body: unknown) =>
			handleHttpRoute(implementation, {
				request: { body },
				signal,
				mediaType,
			});
		await run("text/plain", "ada");
		await run("application/json", { name: "Grace" });
		expect(seen.mock.calls).toEqual([
			["text/plain", "ADA"],
			["application/json", "Grace"],
		]);
	});

	it("propagates ordinary handler errors", async () => {
		const error = new Error("handler failed");
		await expect(async () =>
			execute(
				route.handler((): string => {
					throw error;
				}),
			),
		).rejects.toBe(error);
	});
});

describe("normalizeImplicitResponse", () => {
	it.each([
		null,
		undefined,
		"hello",
		42,
		{ data: "ordinary" },
		{ contentType: 1, data: "ordinary" },
		{ contentType: "text/plain", data: "ordinary" },
	])("uses JSON for ordinary output %j", (value) => {
		expect(normalizeImplicitResponse(value)).toEqual({
			status: 200,
			body: { value, contentType: "application/json" },
		});
	});

	it("gives status envelopes precedence over other fields", () => {
		expect(
			normalizeImplicitResponse({
				status: 204,
				contentType: "text/plain",
				data: "ignored",
			}),
		).toEqual({ status: 204, headers: undefined });
	});

	it("distinguishes an absent body from an explicitly undefined body", () => {
		expect(normalizeImplicitResponse({ status: 204 })).not.toHaveProperty(
			"body",
		);
		expect(
			normalizeImplicitResponse({ status: 200, body: undefined }),
		).toHaveProperty("body", {
			value: undefined,
			contentType: "application/json",
		});
	});

	it.each([200, 299])(
		"accepts the 2xx status %s and preserves headers",
		(status) => {
			expect(
				normalizeImplicitResponse({
					status,
					body: "hello",
					contentType: "text/plain",
					headers: { count: 2 },
				}),
			).toEqual({
				status,
				headers: { count: 2 },
				body: { value: "hello", contentType: "text/plain" },
			});
		},
	);

	it.each([
		{ status: "200" },
		{ status: undefined },
		{ id: 1, status: "open" },
	])("treats a non-numeric status as part of a 200 body %j", (value) => {
		expect(normalizeImplicitResponse(value)).toEqual({
			status: 200,
			body: { value, contentType: "application/json" },
		});
	});

	it.each([199, 300, 404, 200.5, NaN, Infinity])(
		"rejects the inferred status %s outside 2xx",
		(status) => {
			expect(() => normalizeImplicitResponse({ status })).toThrow(
				"must be from 200 to 299",
			);
		},
	);

	it.each(["plain", "envelope"])(
		"treats %s async iterables as streams",
		(mode) => {
			const stream = (async function* () {})();
			expect(
				normalizeImplicitResponse(
					mode === "plain" ? stream : { status: 201, body: stream },
				),
			).toEqual({
				status: mode === "plain" ? 200 : 201,
				headers: undefined,
				body: { stream },
			});
		},
	);

	it("passes streams with an explicit content type to the body codecs", () => {
		const body = new ReadableStream<Uint8Array>();
		expect(
			normalizeImplicitResponse({
				status: 200,
				body,
				contentType: "application/octet-stream",
			}),
		).toEqual({
			status: 200,
			body: { value: body, contentType: "application/octet-stream" },
		});
	});
});
