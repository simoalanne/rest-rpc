import { bodyCodec } from "../codecs/bodyCodec.ts";
import { createBodyCodecRegistry } from "../codecs/registry.ts";
import type { BodyContent } from "../contract/body.ts";
import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { routeError, RouteError } from "../contract/routeError.ts";
import { fetchResponse } from "./response.ts";

const invalid: StandardSchemaV1<unknown, Record<string, string>> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid" }] }),
	},
};
const json = (value: unknown, headers?: RequestInit["headers"]) =>
	Response.json(value, { status: 201, headers });
const declared = route
	.get("/")
	.response(type<{ name: string }>(), { status: 201 })["~restrpc"];
const codecs = createBodyCodecRegistry([]);
const decode = (response: Response, validate = true, declaration = declared) =>
	fetchResponse(async () => response, validate, codecs, declaration);

describe("client response decoding", () => {
	it("transforms declared headers and keeps undeclared headers", async () => {
		const declaration = route.get("/").response(type<{ name: string }>(), {
			status: 201,
			headers: type((input: Record<string, string>) => ({
				count: Number(input["x-count"]),
			})),
		})["~restrpc"];
		const read = (validate: boolean) =>
			fetchResponse(
				async () => json({ name: "Ada" }, { "x-count": "2" }),
				validate,
				codecs,
				declaration,
			);
		expect(await read(true)).toMatchObject({
			status: 201,
			body: { name: "Ada" },
			headers: { count: 2, "x-count": "2", "content-type": "application/json" },
		});
		expect(await read(false)).toMatchObject({
			headers: { "x-count": "2" },
		});
	});

	it("rejects header and body schema failures as unknown errors with the decoded body", async () => {
		for (const declaration of [
			route.get("/").response(invalid, { status: 201 })["~restrpc"],
			route.get("/").response(type(), { status: 201, headers: invalid })[
				"~restrpc"
			],
		]) {
			const read = (validate: boolean) =>
				fetchResponse(
					async () => json({ name: "Ada" }),
					validate,
					codecs,
					declaration,
				);
			await expect(read(true)).rejects.toMatchObject({
				code: "UNKNOWN_ERROR",
				status: 201,
				data: { name: "Ada" },
				cause: [{ message: "invalid" }],
			});
			expect(await read(false)).toMatchObject({
				status: 201,
				body: { name: "Ada" },
			});
		}
	});

	it("decodes bodyless responses without a codec", async () => {
		const declaration = route.get("/").response({ status: 204 })["~restrpc"];
		expect(
			await fetchResponse(
				async () => new Response(null, { status: 204 }),
				true,
				codecs,
				declaration,
			),
		).toMatchObject({ status: 204, body: undefined });
	});

	it.each([undefined, "application/unknown"])(
		"handles absent or unknown response content types (%s)",
		async (contentType) => {
			const content = {
				[contentType ?? "application/json"]: type(),
			} as BodyContent;
			const declaration = route.get("/").response(content)["~restrpc"];
			const response = new Response("hello", {
				headers: contentType ? { "content-type": contentType } : {},
			});
			// Response adds a text/plain default for strings; explicitly remove it for the absent-header case.
			if (!contentType) response.headers.delete("content-type");
			const result = await fetchResponse(
				async () => response,
				true,
				codecs,
				declaration,
			);
			if (contentType) {
				expect(result.body).toBeInstanceOf(Blob);
				expect(await (result.body as Blob).text()).toBe("hello");
			} else {
				expect(result.body).toBeUndefined();
			}
		},
	);

	it("falls back to binary decoding when a custom codec has no deserializer", async () => {
		const declaration = route
			.get("/")
			.response({ "application/custom": type() })["~restrpc"];
		expect(
			await fetchResponse(
				async () =>
					new Response("hello", {
						headers: { "content-type": "application/custom" },
					}),
				true,
				createBodyCodecRegistry([
					bodyCodec("application/custom", { serialize: String }),
				]),
				declaration,
			),
		).toHaveProperty("body", expect.any(Blob));
	});

	it("rejects undecodable bodies, undeclared statuses and undeclared media types as unknown errors", async () => {
		await expect(
			decode(
				new Response("{", {
					status: 201,
					headers: { "content-type": "application/json" },
				}),
			),
		).rejects.toMatchObject({
			code: "UNKNOWN_ERROR",
			data: undefined,
			cause: expect.any(SyntaxError),
		});
		await expect(
			decode(Response.json({ name: "Ada" }, { status: 202 })),
		).rejects.toMatchObject({
			code: "UNKNOWN_ERROR",
			status: 202,
			data: { name: "Ada" },
		});
		await expect(
			decode(
				new Response("Ada", {
					status: 201,
					headers: { "content-type": "text/plain" },
				}),
			),
		).rejects.toMatchObject({ code: "UNKNOWN_ERROR", data: "Ada" });
	});

	it("keeps failures of reading the body as transport errors", async () => {
		const failure = new TypeError("terminated");
		const body = new ReadableStream({
			start: (controller) => controller.error(failure),
		});
		await expect(
			decode(
				new Response(body, {
					status: 404,
					headers: { "content-type": "application/json" },
				}),
			),
		).rejects.toBe(failure);
	});

	it.each(["wrong content type", "missing body"])(
		"rejects streams with %s as unknown errors",
		async (failure) => {
			const declaration = route.get("/").streamResponse(type<number>())[
				"~restrpc"
			];
			const response =
				failure === "missing body"
					? new Response(null, {
							headers: { "content-type": "text/event-stream" },
						})
					: Response.json(1);
			await expect(
				fetchResponse(async () => response, false, codecs, declaration),
			).rejects.toMatchObject({ code: "UNKNOWN_ERROR", status: 200 });
		},
	);

	it("parses event streams without a declaration and before user codecs", async () => {
		const deserialize = vi.fn();
		const response = await fetchResponse(
			async () =>
				new Response('data: {"n":1}\n\n', {
					headers: { "content-type": "text/event-stream; charset=utf-8" },
				}),
			false,
			createBodyCodecRegistry([{ mediaTypes: [/.*/], deserialize }]),
			route.get("/")["~restrpc"],
		);
		const events = [];
		for await (const event of response.body as AsyncIterable<unknown>)
			events.push(event);
		expect(events).toEqual([{ data: { n: 1 } }]);
		expect(deserialize).not.toHaveBeenCalled();
	});
});

describe("client error responses", () => {
	const UserNotFound = routeError("USER_NOT_FOUND", {
		status: 404,
		data: type((input: { id: number }) => ({ id: String(input.id) })),
		headers: type((input: Record<string, string>) => ({
			retry: Number(input["x-retry"]),
		})),
	});
	const declaration = route.get("/").error(UserNotFound)["~restrpc"];
	const read = (response: Response, validate = true) =>
		fetchResponse(async () => response, validate, codecs, declaration);
	const notFound = (body: unknown, status = 404) =>
		Response.json(body, { status, headers: { "x-retry": "2" } });

	it("rejects with the declared error and validates its data and headers", async () => {
		const body = {
			code: "USER_NOT_FOUND",
			message: "Missing",
			data: { id: 1 },
		};
		const error = await read(notFound(body)).catch((value: unknown) => value);
		expect(error).toBeInstanceOf(RouteError);
		expect(error).toMatchObject({
			code: "USER_NOT_FOUND",
			status: 404,
			message: "Missing",
			data: { id: "1" },
			headers: { retry: 2, "x-retry": "2" },
		});
		await expect(read(notFound(body), false)).rejects.toMatchObject({
			data: { id: 1 },
			headers: { "x-retry": "2" },
		});
	});

	it.each([
		["an undeclared code", { code: "GONE", message: "Gone" }, 404, "Gone"],
		[
			"a status mismatch",
			{ code: "USER_NOT_FOUND" },
			410,
			"Request failed with status 410.",
		],
		[
			"a body without a code",
			"Bad gateway",
			502,
			"Request failed with status 502.",
		],
	])(
		"rejects %s as an unknown error with the decoded body",
		async (_case, body, status, message) => {
			await expect(read(notFound(body, status))).rejects.toMatchObject({
				code: "UNKNOWN_ERROR",
				status,
				message,
				data: body,
				headers: { "x-retry": "2" },
			});
		},
	);

	it("rejects declared errors whose data fails validation as unknown errors", async () => {
		const body = { code: "USER_NOT_FOUND", message: "Missing", data: "1" };
		const invalidData = route
			.get("/")
			.error("USER_NOT_FOUND", { status: 404, data: invalid })["~restrpc"];
		await expect(
			fetchResponse(async () => notFound(body), true, codecs, invalidData),
		).rejects.toMatchObject({
			code: "UNKNOWN_ERROR",
			data: body,
			cause: [{ message: "invalid" }],
		});
	});
});
