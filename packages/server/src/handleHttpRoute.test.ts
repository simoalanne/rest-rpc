import { type } from "@rest-rpc/core";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import {
	flattenRouteImplementations,
	type RuntimeImplementationTree,
} from "./match.ts";
import { serverFirstRoute as route } from "./routeBuilder.ts";
import {
	RequestValidationError,
	ResponseValidationError,
} from "./validationErrors.ts";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";

const rejected: StandardSchemaV1<unknown, Record<string, string>> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid" }] }),
	},
};

const execute = (implementation: RuntimeImplementationTree) =>
	handleHttpRoute(flattenRouteImplementations(implementation)[0]!, {
		request: {},
		handlerFields: {},
	});

describe("handleHttpRoute", () => {
	it.each(["GET", "POST"] as const)(
		"projects transformed flat %s input and transport headers",
		async (method) => {
			const seen = vi.fn();
			const implementation = (method === "GET" ? route.get() : route.post())
				.input(
					type((value: { count: string }) => ({ count: Number(value.count) })),
				)
				.handler((request) => {
					seen(request);
					return request.input;
				});
			const run = (disableRequestValidation: boolean) =>
				handleHttpRoute(flattenRouteImplementations({ implementation })[0]!, {
					request: {
						...(method === "GET"
							? { query: new URLSearchParams("count=2") }
							: { body: { count: "2" } }),
						headers: {
							"content-type": ["Application/JSON; charset=utf-8"],
							"last-event-id": ["one", "two"],
						},
					},
					handlerFields: { native: "adapter" },
					configuration: { disableRequestValidation },
				});
			expect(await run(false)).toMatchObject({ body: { value: { count: 2 } } });
			expect(seen.mock.calls[0]![0]).toMatchObject({
				input: { count: 2 },
				contentType: "application/json",
				lastEventId: "one",
				native: "adapter",
			});
			expect(seen.mock.calls[0]![0]).not.toHaveProperty("body");
			const raw = await run(true);
			expect(raw).toMatchObject({
				body: {
					value:
						method === "GET" ? expect.any(URLSearchParams) : { count: "2" },
				},
			});
		},
	);

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
				200,
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
				responseHeaders: { count: 2 },
			}));
		const run = (disableResponseValidation: boolean) =>
			handleHttpRoute(flattenRouteImplementations(implementation)[0]!, {
				request: {},
				handlerFields: {},
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
					200,
					location === "body" ? rejected : type<string>(),
					location === "headers" ? { headers: rejected } : {},
				)
				.handler(() => ({ status: 200, body: "ok", responseHeaders: {} }));
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
			.streamResponse(
				200,
				type((value: string) => Number(value)),
			)
			.handler(() => ({ status: 200, body: chunks() }));
		for (const disabled of [false, true]) {
			const result = await handleHttpRoute(
				flattenRouteImplementations(implementation)[0]!,
				{
					request: {},
					handlerFields: {},
					configuration: { disableResponseValidation: disabled },
				},
			);
			if (!("kind" in result) || result.kind !== "stream")
				throw new Error("Expected stream");
			const frames = [];
			for await (const frame of result.body) frames.push(frame);
			expect(frames).toEqual([disabled ? 'data: "2"\n\n' : "data: 2\n\n"]);
		}
	});

	it("dispatches declared plain and custom outputs through response validation", async () => {
		expect(
			await execute({
				get: route
					.output(type((value: string) => value.toUpperCase()))
					.handler(() => "hello"),
			}),
		).toMatchObject({
			body: { value: "HELLO", contentType: "application/json" },
		});
		const custom = route
			.output(type<string>(), { contentType: "text/plain" })
			.handler(() => ({ contentType: "text/plain", data: "hello" }));
		expect(await execute({ custom })).toMatchObject({
			body: { value: "hello", contentType: "text/plain" },
		});
		const runtime = flattenRouteImplementations({ custom })[0]!;
		await expect(
			handleHttpRoute(
				{ ...runtime, handler: () => "hello" },
				{ request: {}, handlerFields: {} },
			),
		).rejects.toThrow("Custom procedure output must return");
	});
	it("rejects an undeclared response status even with response validation disabled", async () => {
		const declared = route
			.get("/")
			.response(200, type<string>())
			.handler(() => ({ status: 200, body: "ok" }));
		const implementation = {
			...flattenRouteImplementations(declared)[0]!,
			handler: () => ({ status: 404, body: "missing" }),
		};
		await expect(
			handleHttpRoute(implementation, {
				request: {},
				handlerFields: {},
				configuration: { disableResponseValidation: true },
			}),
		).rejects.toThrow("returned undeclared status 404");
	});

	it("requires a declared response content type and normalizes the selection", async () => {
		const declared = route
			.get("/")
			.response(200, type<string>(), {
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
				{ request: {}, handlerFields: {} },
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
