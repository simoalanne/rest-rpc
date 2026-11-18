import { route, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import {
	parseQuery,
	validateRequestSegments,
	validateResponseValue,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { sseEvent } from "./sse.ts";

const schema = <T>(
	validate: StandardSchemaV1<unknown, T>["~standard"]["validate"],
): StandardSchemaV1<unknown, T> => ({
	"~standard": { version: 1, vendor: "test", validate },
});

describe("validation", () => {
	it("parses bracket arrays and uses the last scalar query value", () => {
		expect(parseQuery("tags[]=a&tags[]=b&page=1&page=2")).toEqual({
			tags: ["a", "b"],
			page: "2",
		});
	});

	it("does not let a __proto__ key give the query inherited values", () => {
		for (const query of ["__proto__[]=x", "__proto__%5B%5D=x"]) {
			const parsed = parseQuery(query);
			expect(parsed.length).toBeUndefined();
			expect(parsed.push).toBeUndefined();
		}
	});

	it("parses queries like URLSearchParams", () => {
		for (const query of [
			"",
			"a",
			"a=&=b&&c=d=e",
			"name=a+b&encoded=%C3%A4%20x&bad=%E0%A4%A&tags%5B%5D=x",
		]) {
			expect(parseQuery(query)).toEqual(
				Object.fromEntries(
					[...new URLSearchParams(query)].map(([key, value]) =>
						key.endsWith("[]") ? [key.slice(0, -2), [value]] : [key, value],
					),
				),
			);
		}
	});

	it("merges stacked schema outputs with later keys taking precedence", async () => {
		const definition = route.post("/")["~restrpc"];
		const stacked = {
			...definition,
			request: {
				body: [
					schema(() => ({ value: { first: true, shared: 1 } })),
					schema(async () => ({ value: { second: true, shared: 2 } })),
				],
			},
		};
		expect((await validateRequestSegments(stacked, {})).body).toEqual({
			first: true,
			second: true,
			shared: 2,
		});
	});

	it("ignores segments without schemas", async () => {
		const definition = route.post("/")["~restrpc"];
		expect(
			(await validateRequestSegments(definition, { body: "unused" })).body,
		).toBeUndefined();
	});

	it("rejects nonobject stacked outputs", async () => {
		const definition = route.post("/")["~restrpc"];
		await expect(async () =>
			validateRequestSegments(
				{
					...definition,
					request: {
						body: [schema(() => ({ value: 1 })), type()],
					},
				},
				{},
			),
		).rejects.toThrow();
	});

	it("groups failures by request segment", async () => {
		const issues = [{ message: "invalid" }];
		const definition = {
			...route.post("/")["~restrpc"],
			request: {
				body: [schema(() => ({ issues })), schema(() => ({ value: {} }))],
				query: [
					schema(() => ({ issues })) as StandardSchemaV1<
						Record<string, unknown>,
						unknown
					>,
				],
			},
		};
		await expect(async () =>
			validateRequestSegments(definition, {}),
		).rejects.toMatchObject({
			code: "REQUEST_VALIDATION_FAILED",
			status: 400,
			data: { body: issues, query: issues, params: [], headers: [] },
		});
	});

	it("uses transformed response bodies and headers", async () => {
		expect(
			await validateResponseValue(
				schema(() => ({ value: 42 })),
				"42",
				"body",
			),
		).toBe(42);
		expect(await validateResponseValue(undefined, "raw", "body")).toBe("raw");
		expect(
			await validateResponseHeaders(
				schema(() => ({ value: { count: 2, absent: undefined } })),
				{},
			),
		).toEqual({ count: 2, absent: undefined });
	});

	it("keeps response failure issues in the cause instead of the data", async () => {
		const issues = [{ message: "private detail" }];
		await expect(async () =>
			validateResponseValue(
				schema(() => ({ issues })),
				{},
				"body",
			),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			status: 500,
			data: undefined,
			cause: { location: "body", issues },
		});
		await expect(async () =>
			validateResponseHeaders(
				schema(() => ({ issues })),
				{},
			),
		).rejects.toMatchObject({ cause: { location: "headers", issues } });
	});

	it("validates stream data while preserving SSE metadata and reports stream failures lazily", async () => {
		async function* values() {
			yield sseEvent("1", { id: "event-1" });
			yield "bad";
		}
		const chunks = validateResponseStreamChunks(
			values(),
			schema((value) =>
				value === "1"
					? { value: 1 }
					: { issues: [{ message: "invalid chunk" }] },
			),
		);
		expect((await chunks.next()).value).toMatchObject({
			data: 1,
			id: "event-1",
		});
		await expect(chunks.next()).rejects.toMatchObject({
			cause: { location: "stream" },
		});
	});
});
