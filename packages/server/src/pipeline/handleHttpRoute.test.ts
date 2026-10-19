import { type } from "@rest-rpc/core";
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
import { RequestValidationError, ResponseValidationError } from "./errors.ts";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";

const rejected: StandardSchemaV1<unknown, Record<string, string>> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid" }] }),
	},
};

const signal = new AbortController().signal;

const execute = (implementation: RuntimeImplementationTree) =>
	handleHttpRoute(flattenRouteImplementations(implementation)[0]!, {
		request: {},
		signal,
	});

describe("handleHttpRoute", () => {
	it("projects transformed request segments and transport headers", async () => {
		const seen = vi.fn();
		const implementation = route
			.post()
			.body(
				type((value: { count: string }) => ({ count: Number(value.count) })),
			)
			.handler((request) => {
				seen(request);
				return request.body;
			});
		const run = (disableRequestValidation: boolean) =>
			handleHttpRoute(flattenRouteImplementations({ implementation })[0]!, {
				request: {
					body: { count: "2" },
					headers: {
						"content-type": ["Application/JSON; charset=utf-8"],
						"last-event-id": ["one", "two"],
					},
				},
				signal,
				configuration: { disableRequestValidation },
			});
		expect(await run(false)).toMatchObject({ body: { value: { count: 2 } } });
		expect(seen.mock.calls[0]![0]).toMatchObject({
			body: { count: 2 },
			contentType: "application/json",
			lastEventId: "one",
			signal,
		});
		expect(seen.mock.calls[0]![0]).not.toHaveProperty("input");
		expect(await run(true)).toMatchObject({
			body: { value: { count: "2" } },
		});
	});

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

	it("returns request validation errors without invoking the handler", async () => {
		const handler = vi.fn(() => "ok");
		const implementation = route.post("/").body(rejected).handler(handler);
		expect(await execute(implementation)).toBeInstanceOf(
			RequestValidationError,
		);
		expect(handler).not.toHaveBeenCalled();
	});

	it("transforms declared bodies and headers unless response validation is disabled", async () => {
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
				configuration: { disableResponseValidation },
			});
		expect(await run(false)).toMatchObject({
			headers: { count: "3" },
			body: { value: 2 },
		});
		expect(await run(true)).toMatchObject({
			headers: { count: "2" },
			body: { value: "2" },
		});
	});

	it.each(["body", "headers"] as const)(
		"returns declared %s validation failures",
		async (location) => {
			const implementation = route
				.get("/")
				.response(
					location === "body" ? rejected : type<string>(),
					location === "headers" ? { headers: rejected } : {},
				)
				.handler(() => ({ status: 200, body: "ok", headers: {} }));
			const result = await execute(implementation);
			expect(result).toBeInstanceOf(ResponseValidationError);
			expect(result).toMatchObject({ location });
		},
	);

	it("validates declared stream chunks lazily", async () => {
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
					configuration: { disableResponseValidation: disabled },
				},
			);
			if (!("body" in result)) throw new Error("Expected stream");
			const frames = [];
			for await (const frame of result.body!.value as AsyncIterable<string>)
				frames.push(frame);
			expect(frames).toEqual([disabled ? 'data: "2"\n\n' : "data: 2\n\n"]);
		}
	});

	it("frames inferred streams as SSE and serializes headers", async () => {
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
			headers: { count: "1" },
			body: { contentType: "text/event-stream" },
		});
		const frames = [];
		for await (const frame of result.body!.value as AsyncIterable<string>)
			frames.push(frame);
		expect(frames).toEqual(["id: one\ndata: 1\n\n"]);
	});

	it("dispatches declared envelopes and plain bodies through response validation", async () => {
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
	it("rejects an undeclared response status even with response validation disabled", async () => {
		const declared = route
			.get("/")
			.response(type<string>())
			.handler(() => ({ status: 200, body: "ok" }));
		const implementation = {
			...flattenRouteImplementations(declared)[0]!,
			handler: () => ({ status: 404, body: "missing" }),
		};
		await expect(
			handleHttpRoute(implementation, {
				request: {},
				signal,
				configuration: { disableResponseValidation: true },
			}),
		).rejects.toThrow("returned undeclared status 404");
	});

	it("requires a declared response content type and normalizes the selection", async () => {
		const declared = route
			.get("/")
			.response(type<string>(), {
				contentType: ["text/plain", "text/html"],
			})
			.handler(() => ({ status: 200, body: "ok", contentType: "text/plain" }));
		const implementation = flattenRouteImplementations(declared)[0]!;
		const run = (contentType?: string) =>
			handleHttpRoute(
				{
					...implementation,
					handler: () => ({ status: 200, body: "ok", contentType }),
				},
				{ request: {}, signal },
			);
		expect(await run("Text/Plain; charset=utf-8")).toMatchObject({
			body: { contentType: "text/plain" },
		});
		await expect(run()).rejects.toThrow(
			"Unsupported response body contentType.",
		);
		await expect(run("application/json")).rejects.toThrow(
			"Unsupported response body contentType.",
		);
	});

	it("propagates ordinary handler errors", async () => {
		const error = new Error("handler failed");
		await expect(
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

	it.each([100, 200, 599])(
		"accepts integer HTTP status %s and preserves headers",
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

	it.each([99, 600, 200.5, NaN, Infinity])(
		"rejects invalid inferred status %s",
		(status) => {
			expect(() => normalizeImplicitResponse({ status })).toThrow(
				"Invalid inferred HTTP response status",
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

	it("does not classify non-callable asyncIterator properties as streams", () => {
		const value = { [Symbol.asyncIterator]: true };
		expect(normalizeImplicitResponse(value)).toMatchObject({
			body: { value },
		});
	});
});
