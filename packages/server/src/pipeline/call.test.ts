import { RouteError, routeError, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { call, initLocalClient } from "./call.ts";
import { sse } from "./sse.ts";
import { route } from "../builder/routeBuilder.ts";

describe("call", () => {
	it("validates schema inputs, passes options, and returns unserialized output", async () => {
		const seen = vi.fn();
		const implementation = route
			.$context<{ user: string }>()
			.get("/items/{id}")
			.params(type((value: { id: string }) => ({ id: Number(value.id) })))
			.response(
				type((value: string) => Number(value)),
				{
					headers: type((value: { total: number }) => ({
						total: value.total + 1,
					})),
				},
			)
			.handler((request) => {
				seen(request);
				return { status: 200, body: "2", headers: { total: 1 } };
			});
		expect(
			await call(
				implementation,
				{ params: { id: "1" } },
				{ context: { user: "Ada" } },
			),
		).toEqual({
			status: 200,
			contentType: "application/json",
			body: 2,
			headers: { total: 2 },
		});
		const request = seen.mock.calls[0]![0];
		expect(request).toMatchObject({ params: { id: 1 } });
		expect(request.signal.aborted).toBe(false);
		expect(request.context.get("user")).toBe("Ada");
	});

	it("rejects like the fetch client for declared, built-in and undeclared errors", async () => {
		const NotFound = routeError("NOT_FOUND", {
			status: 404,
			data: type((id: number) => String(id)),
		});
		const thrown = vi.fn((): RouteError => new NotFound(1));
		const implementation = route
			.post("/")
			.body(type<{ id: number }>())
			.error(NotFound)
			.handler((): string => {
				throw thrown();
			});
		await expect(
			call(implementation, { body: { id: 1 } }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			status: 404,
			data: "1",
		});

		const rejecting: StandardSchemaV1 = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ issues: [{ message: "invalid" }] }),
			},
		};
		const invalid = route
			.post("/")
			.body(rejecting)
			.handler(() => "ok");
		await expect(call(invalid, { body: {} })).rejects.toMatchObject({
			code: "UNKNOWN_ERROR",
			status: 400,
			data: { code: "REQUEST_VALIDATION_FAILED" },
			cause: { code: "REQUEST_VALIDATION_FAILED" },
		});

		thrown.mockImplementation(() => new RouteError("GONE"));
		await expect(call(implementation, { body: { id: 1 } })).rejects.toThrow(
			'threw undeclared error code "GONE"',
		);
	});

	it("passes params of dynamic path segments without a params schema", async () => {
		const implementation = route
			.get("/items/{id}")
			.handler(({ params }) => params.id);
		expect(await call(implementation, { params: { id: "1" } })).toMatchObject({
			body: "1",
		});
	});

	it("yields stream items as SSE events", async () => {
		async function* values() {
			yield sse({ data: 1, id: "one" });
			yield 2;
		}
		const { body } = await call(route.get("/").handler(() => values()));
		const events = [];
		for await (const event of body) events.push(event);
		expect(events).toStrictEqual([{ data: 1, id: "one" }, { data: 2 }]);
	});
});

describe("initLocalClient", () => {
	it("calls the routes of a nested route tree", async () => {
		const client = initLocalClient({
			health: { get: route.get("/health").handler(() => "ok") },
		});
		expect(await client.health.get()).toMatchObject({ body: "ok" });
	});
});
