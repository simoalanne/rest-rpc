import { bodyCodec } from "../codecs/bodyCodec.ts";
import { createBodyCodecRegistry } from "../codecs/registry.ts";
import type { BodyContent } from "../contract/body.ts";
import { route } from "../contract/routeBuilder.ts";
import { sse } from "../contract/sse.ts";
import { type } from "../standard-schema/type.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { routeError, RouteError } from "../contract/routeError.ts";
import { readResponse } from "./response.ts";

const invalid: StandardSchemaV1<unknown, Record<string, string>> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid" }] }),
	},
};
const json = (value: unknown, headers?: RequestInit["headers"]) =>
	Response.json(value, { status: 201, headers });
const defined = route
	.get("/")
	.response(type<{ name: string }>(), { status: 201 })["~restrpc"];
const codecs = createBodyCodecRegistry([]);
const decode = (response: Response, validate = true, definition = defined) =>
	readResponse(response, definition, validate, codecs);
// Responses outside the contract reject with a plain Error, not a RouteError.
const expectError = async (promise: Promise<unknown>, expected: object) => {
	const error = await promise.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(Error);
	expect(error).not.toBeInstanceOf(RouteError);
	expect(error).toMatchObject(expected);
};
const contractMismatch = "Response did not match the route contract.";

describe("client response decoding", () => {
	it("transforms defined headers and keeps other headers", async () => {
		const definition = route.get("/").response(type<{ name: string }>(), {
			status: 201,
			headers: type((input: Record<string, string>) => ({
				count: Number(input["x-count"]),
			})),
		})["~restrpc"];
		const read = (validate: boolean) =>
			readResponse(
				json({ name: "Ada" }, { "x-count": "2" }),
				definition,
				validate,
				codecs,
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

	it("rejects header and body schema failures as errors with the issues", async () => {
		for (const definition of [
			route.get("/").response(invalid, { status: 201 })["~restrpc"],
			route.get("/").response(type(), { status: 201, headers: invalid })[
				"~restrpc"
			],
		]) {
			const read = (validate: boolean) =>
				readResponse(json({ name: "Ada" }), definition, validate, codecs);
			await expectError(read(true), {
				message: contractMismatch,
				cause: [{ message: "invalid" }],
			});
			expect(await read(false)).toMatchObject({
				status: 201,
				body: { name: "Ada" },
			});
		}
	});

	it("decodes bodyless responses without a codec", async () => {
		const definition = route.get("/").response({ status: 204 })["~restrpc"];
		expect(
			await readResponse(
				new Response(null, { status: 204 }),
				definition,
				true,
				codecs,
			),
		).toMatchObject({ status: 204, body: undefined });
	});

	it.each([undefined, "application/unknown"])(
		"handles absent or unknown response content types (%s)",
		async (contentType) => {
			const content = {
				[contentType ?? "application/json"]: type(),
			} as BodyContent;
			const definition = route.get("/").response(content)["~restrpc"];
			const response = new Response("hello", {
				headers: contentType ? { "content-type": contentType } : {},
			});
			// Response adds a text/plain default for strings; explicitly remove it for the absent-header case.
			if (!contentType) response.headers.delete("content-type");
			const result = await readResponse(response, definition, true, codecs);
			if (contentType) {
				expect(result.body).toBeInstanceOf(Blob);
				expect(await (result.body as Blob).text()).toBe("hello");
			} else {
				expect(result.body).toBeUndefined();
			}
		},
	);

	it("falls back to binary decoding when a custom codec has no deserializer", async () => {
		const definition = route
			.get("/")
			.response({ "application/custom": type() })["~restrpc"];
		expect(
			await readResponse(
				new Response("hello", {
					headers: { "content-type": "application/custom" },
				}),
				definition,
				true,
				createBodyCodecRegistry([
					bodyCodec("application/custom", { serialize: String }),
				]),
			),
		).toHaveProperty("body", expect.any(Blob));
	});

	it("rejects undecodable bodies, unknown statuses and unknown media types as errors", async () => {
		await expectError(
			decode(
				new Response("{", {
					status: 201,
					headers: { "content-type": "application/json" },
				}),
			),
			{
				message: "Response body could not be decoded.",
				cause: expect.any(SyntaxError),
			},
		);
		await expectError(decode(Response.json({ name: "Ada" }, { status: 202 })), {
			message: contractMismatch,
		});
		await expectError(
			decode(
				new Response("Ada", {
					status: 201,
					headers: { "content-type": "text/plain" },
				}),
			),
			{ message: contractMismatch },
		);
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

	it("passes the body to codecs without buffering it", async () => {
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start: (controller) => controller.enqueue(encoder.encode("first")),
		});
		const definition = route
			.get("/")
			.response({ "application/custom": type<string>() })["~restrpc"];
		const result = await readResponse(
			new Response(body, {
				headers: { "content-type": "application/custom" },
			}),
			definition,
			true,
			createBodyCodecRegistry([
				bodyCodec("application/custom", {
					deserialize: async (source) => {
						const { value } = await source.body!.getReader().read();
						return new TextDecoder().decode(value);
					},
				}),
			]),
		);
		expect(result.body).toBe("first");
	});

	it.each([
		["wrong content type", contractMismatch],
		["missing body", "Server returned no stream body."],
	])("rejects streams with %s as errors", async (failure, message) => {
		const definition = route.get("/").response(sse(type<number>()))["~restrpc"];
		const response =
			failure === "missing body"
				? new Response(null, {
						headers: { "content-type": "text/event-stream" },
					})
				: Response.json(1);
		await expectError(readResponse(response, definition, false, codecs), {
			message,
		});
	});

	it("rejects event streams the route does not define without reading them", async () => {
		const cancel = vi.fn();
		const stream = () =>
			new Response(new ReadableStream({ cancel }), {
				status: 202,
				headers: { "content-type": "text/event-stream" },
			});
		await expectError(decode(stream()), { message: contractMismatch });
		const json = route.get("/").response(type<string>())["~restrpc"];
		const ok = new Response(new ReadableStream({ cancel }), {
			headers: { "content-type": "text/event-stream" },
		});
		await expectError(readResponse(ok, json, false, codecs), {
			message: contractMismatch,
		});
		expect(cancel).toHaveBeenCalledTimes(2);
	});

	it("parses event streams without a definition and before user codecs", async () => {
		const deserialize = vi.fn();
		const response = await readResponse(
			new Response('data: {"n":1}\n\n', {
				headers: { "content-type": "text/event-stream; charset=utf-8" },
			}),
			route.get("/")["~restrpc"],
			false,
			createBodyCodecRegistry([{ mediaTypes: [/.*/], deserialize }]),
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
	const definition = route.get("/").error(UserNotFound)["~restrpc"];
	const read = (response: Response, validate = true) =>
		readResponse(response, definition, validate, codecs);
	const notFound = (body: unknown, status = 404) =>
		Response.json(body, { status, headers: { "x-retry": "2" } });

	it("rejects with the defined error and validates its data and headers", async () => {
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
			isDefined: true,
		});
		await expect(read(notFound(body), false)).rejects.toMatchObject({
			data: { id: 1 },
			headers: { "x-retry": "2" },
		});
	});

	it.each([
		[
			"an unknown code",
			{ code: "GONE", message: "Gone", data: { id: 1 } },
			404,
			"Gone",
		],
	])(
		"rejects %s as an untyped error with the received values",
		async (_case, body, status, message) => {
			const error = await read(notFound(body, status)).catch(
				(value: unknown) => value,
			);
			expect(error).toBeInstanceOf(RouteError);
			expect(error).toMatchObject({
				code: body.code,
				status,
				message,
				data: "data" in body ? body.data : undefined,
				headers: { "x-retry": "2" },
				isDefined: false,
			});
		},
	);

	it("rejects a defined code with another status as a contract mismatch", async () => {
		await expectError(read(notFound({ code: "USER_NOT_FOUND" }, 410)), {
			message: contractMismatch,
		});
	});

	it("rejects a body without a code as an error with the status in its message", async () => {
		await expectError(read(notFound("Bad gateway", 502)), {
			message: "Request failed with status 502.",
		});
	});

	it("rejects defined errors whose data fails validation as errors", async () => {
		const body = { code: "USER_NOT_FOUND", message: "Missing", data: "1" };
		const invalidData = route
			.get("/")
			.error("USER_NOT_FOUND", { status: 404, data: invalid })["~restrpc"];
		await expectError(readResponse(notFound(body), invalidData, true, codecs), {
			message: contractMismatch,
			cause: [{ message: "invalid" }],
		});
	});

	it("reads set-cookie values as cookies instead of a header", async () => {
		const headers = new Headers({ "content-type": "application/json" });
		headers.append("set-cookie", "a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT");
		headers.append("set-cookie", "b=2");
		const response = await decode(
			new Response(JSON.stringify({ name: "Ada" }), { status: 201, headers }),
		);
		expect(response.cookies).toEqual([
			"a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
			"b=2",
		]);
		expect(response.headers).not.toHaveProperty("set-cookie");

		const error = await decode(
			Response.json(
				{ code: "SESSION_EXPIRED" },
				{ status: 401, headers: { "set-cookie": "session=; Max-Age=0" } },
			),
		).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(RouteError);
		expect(error).toMatchObject({ cookies: ["session=; Max-Age=0"] });
		expect((error as RouteError).headers).not.toHaveProperty("set-cookie");
	});
});
