import { respond } from "../pipeline/respond.ts";
import { invokeWithMiddleware } from "./middleware.ts";

type NextRequest = {
	context: Record<string, unknown>;
	next: (options?: { context?: object }) => Promise<{ body: unknown }>;
};

const asRequest = (value: unknown) => value as NextRequest;

describe("middleware", () => {
	it("runs in registration order and passes injected context downstream", async () => {
		const calls: string[] = [];
		const result = await invokeWithMiddleware(
			[
				async (value) => {
					const { context, next } = asRequest(value);
					calls.push(`outer ${JSON.stringify(context)}`);
					const response = await next({ context: { user: "Ada" } });
					calls.push("after");
					return response;
				},
				(value) => {
					const { context, next } = asRequest(value);
					calls.push(`inner ${JSON.stringify(context)}`);
					return next();
				},
			],
			(value) => {
				calls.push(`handler ${JSON.stringify(asRequest(value).context)}`);
				return 3;
			},
			{ context: { db: 1 } },
			200,
		);
		expect(result).toEqual(respond(3, { status: 200 }));
		expect(calls).toEqual([
			'outer {"db":1}',
			'inner {"db":1,"user":"Ada"}',
			'handler {"db":1,"user":"Ada"}',
			"after",
		]);
	});

	it("resolves next() to the handler result as an envelope with its status", async () => {
		const seen: unknown[] = [];
		const middleware = async (value: unknown) => {
			const response = await asRequest(value).next();
			seen.push(response);
			return response;
		};
		await invokeWithMiddleware(
			[middleware],
			() => "body",
			{ context: {} },
			201,
		);
		await invokeWithMiddleware(
			[middleware],
			() => respond("body", { headers: { a: "1" } }),
			{ context: {} },
			200,
		);
		expect(seen).toEqual([
			respond("body", { status: 201 }),
			respond("body", { headers: { a: "1" }, status: 200 }),
		]);
	});

	it("allows middleware to short circuit downstream execution", async () => {
		const handler = vi.fn();
		const cached = respond("cached");
		expect(
			await invokeWithMiddleware([() => cached], handler, { context: {} }, 200),
		).toBe(cached);
		expect(handler).not.toHaveBeenCalled();
	});

	it("reads objects of the response shape as responses", async () => {
		const result = await invokeWithMiddleware(
			[() => ({ status: 201, body: { id: "1" }, headers: { a: "1" } })],
			() => "ok",
			{ context: {} },
			200,
		);
		expect(result).toEqual(
			respond({ id: "1" }, { status: 201, headers: { a: "1" } }),
		);
	});

	it("rejects middleware that does not return a response", async () => {
		const run = (callback: (value: unknown) => unknown) =>
			invokeWithMiddleware([callback], () => "ok", { context: {} }, 200);
		expect(() => run(() => "stopped")).toThrow(
			"Middleware must return a response, such as the result of next() or respond().",
		);
		await expect(
			run(async (value) => {
				await asRequest(value).next();
			}),
		).rejects.toThrow(
			"Middleware must return a response, such as the result of next() or respond().",
		);
	});

	it("rejects a second next call without invoking the handler twice", async () => {
		const handler = vi.fn();
		await expect(
			invokeWithMiddleware(
				[
					async (value) => {
						const { next } = asRequest(value);
						await next();
						return next();
					},
				],
				handler,
				{ context: {} },
				200,
			),
		).rejects.toThrow("Middleware next() may only be called once.");
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
