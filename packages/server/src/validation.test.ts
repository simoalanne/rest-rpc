import { route, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import {
	validateRequestSegments,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { sse } from "./sse.ts";

const schema = <T>(
	validate: StandardSchemaV1<unknown, T>["~standard"]["validate"],
): StandardSchemaV1<unknown, T> => ({
	"~standard": { version: 1, vendor: "test", validate },
});

describe("validation", () => {
	it("parses bracket arrays and uses the last scalar query value", async () => {
		const declaration = route
			.get("/")
			.query(type<{ tags: string[]; page: string }>())["~restrpc"];
		const query = new URLSearchParams("tags[]=a&tags[]=b&page=1&page=2");
		expect(
			(await validateRequestSegments(declaration, { query })).query,
		).toEqual({ tags: ["a", "b"], page: "2" });
	});

	it("merges stacked schema outputs with later keys taking precedence", async () => {
		const declaration = route.post("/")["~restrpc"];
		const stacked = {
			...declaration,
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

	it("ignores undeclared segments", async () => {
		const declaration = route.post("/")["~restrpc"];
		expect(
			(await validateRequestSegments(declaration, { body: "unused" })).body,
		).toBeUndefined();
	});

	it("rejects nonobject stacked outputs", async () => {
		const declaration = route.post("/")["~restrpc"];
		await expect(
			validateRequestSegments(
				{
					...declaration,
					request: { body: [schema(() => ({ value: 1 })), type()] },
				},
				{},
			),
		).rejects.toThrow("Stacked request schema outputs must be objects.");
	});

	it("groups failures by request segment and stops a failing schema stack", async () => {
		const issues = [{ message: "invalid" }];
		const later = vi.fn(() => ({ value: {} }));
		const declaration = {
			...route.post("/")["~restrpc"],
			request: {
				body: [schema(() => ({ issues })), schema(later)],
				query: [schema(() => ({ issues }))],
			},
		};
		await expect(
			validateRequestSegments(declaration, {}),
		).rejects.toMatchObject({
			status: 400,
			issues: { body: issues, query: issues, params: [], headers: [] },
		});
		expect(later).not.toHaveBeenCalled();
	});

	it("uses transformed response bodies and stringifies declared headers while omitting undefined", async () => {
		expect(
			await validateResponseBody(
				schema(() => ({ value: 42 })),
				"42",
			),
		).toBe(42);
		expect(await validateResponseBody(undefined, "raw")).toBe("raw");
		expect(
			await validateResponseHeaders(
				{
					body: undefined,
					headers: schema(() => ({ value: { count: 2, absent: undefined } })),
				},
				{},
			),
		).toEqual({ count: "2" });
		expect(
			await validateResponseHeaders(undefined, { count: 2 }),
		).toBeUndefined();
	});

	it("identifies response failures without exposing issues in the response body", async () => {
		const issues = [{ message: "private detail" }];
		await expect(
			validateResponseBody(
				schema(() => ({ issues })),
				{},
			),
		).rejects.toMatchObject({
			location: "body",
			issues,
			status: 500,
			responseBody: { message: "Response validation failed." },
		});
		await expect(
			validateResponseHeaders(
				{ body: undefined, headers: schema(() => ({ issues })) },
				{},
			),
		).rejects.toMatchObject({ location: "headers", issues });
	});

	it("validates stream data while preserving SSE metadata and reports stream failures lazily", async () => {
		async function* values() {
			yield sse({ data: "1", id: "event-1" });
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
		await expect(chunks.next()).rejects.toMatchObject({ location: "stream" });
	});
});
