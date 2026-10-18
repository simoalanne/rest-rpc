import { invokeWithMiddleware } from "./middleware.ts";

describe("middleware", () => {
	it("wraps the handler in registration order and shares request fields", async () => {
		const calls: string[] = [];
		const request = { value: 3 };
		const result = await invokeWithMiddleware(
			[
				async (value) => {
					const { next, ...fields } = value as typeof request & {
						next: () => Promise<number>;
					};
					expect(fields).toEqual(request);
					calls.push("before");
					const result = await next();
					calls.push("after");
					return result + 1;
				},
				(value) => {
					calls.push("inner");
					return (value as { next: () => Promise<unknown> }).next();
				},
			],
			() => {
				calls.push("handler");
				return 3;
			},
			request,
		);
		expect(result).toBe(4);
		expect(calls).toEqual(["before", "inner", "handler", "after"]);
	});

	it("allows middleware to short circuit downstream execution", async () => {
		const handler = vi.fn();
		expect(await invokeWithMiddleware([() => "stopped"], handler, {})).toBe(
			"stopped",
		);
		expect(handler).not.toHaveBeenCalled();
	});

	it("rejects a second next call without invoking the handler twice", async () => {
		const handler = vi.fn();
		await expect(
			invokeWithMiddleware(
				[
					async (value) => {
						const { next } = value as { next: () => Promise<unknown> };
						await next();
						await next();
					},
				],
				handler,
				{},
			),
		).rejects.toThrow("Middleware next() may only be called once.");
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
