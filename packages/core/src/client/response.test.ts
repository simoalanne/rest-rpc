import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { fetchResponse } from "./response.ts";
import { HttpError } from "./httpError.ts";

const invalid: StandardSchemaV1<unknown, Record<string, string>> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid" }] }),
	},
};
const json = (value: unknown, headers?: RequestInit["headers"]) =>
	Response.json(value, { status: 201, headers });
const declared = route.get("/").response(201, type<{ name: string }>())[
	"~restrpc"
];
const decode = (response: Response, validate = true, declaration = declared) =>
	fetchResponse(async () => response, validate, undefined, declaration, []);

describe("client response decoding", () => {
	it("transforms declared headers and retains native headers", async () => {
		const declaration = route.get("/").response(201, type<{ name: string }>(), {
			headers: type((input: Record<string, string>) => ({
				count: Number(input["x-count"]),
			})),
		})["~restrpc"];
		const read = (validate: boolean) =>
			fetchResponse(
				async () => json({ name: "Ada" }, { "x-count": "2" }),
				validate,
				undefined,
				declaration,
				[],
			);
		expect(await read(true)).toMatchObject({
			status: 201,
			body: { name: "Ada" },
			responseHeaders: { count: 2 },
			headers: expect.any(Headers),
		});
		expect(await read(false)).toMatchObject({
			responseHeaders: { "x-count": "2" },
		});
	});

	it("retains status and decoded body on header and body schema failures", async () => {
		for (const declaration of [
			route.get("/").response(201, invalid)["~restrpc"],
			route.get("/").response(201, type(), { headers: invalid })["~restrpc"],
		]) {
			const read = (validate: boolean) =>
				fetchResponse(
					async () => json({ name: "Ada" }),
					validate,
					undefined,
					declaration,
					[],
				);
			await expect(read(true)).rejects.toMatchObject({
				status: 201,
				body: { name: "Ada" },
				cause: [{ message: "invalid" }],
			});
			expect(await read(false)).toMatchObject({
				status: 201,
				body: { name: "Ada" },
			});
		}
	});

	it("decodes bodyless responses without a codec", async () => {
		const declaration = route.get("/").response(204)["~restrpc"];
		expect(
			await fetchResponse(
				async () => new Response(null, { status: 204 }),
				true,
				undefined,
				declaration,
				[],
			),
		).toMatchObject({ status: 204, body: undefined });
	});

	it.each([undefined, "application/unknown"])(
		"handles absent or unknown response content types (%s)",
		async (contentType) => {
			const declaration = route.get("/").response(200, type(), {
				contentType: contentType ?? "application/json",
			})["~restrpc"];
			const response = new Response("hello", {
				headers: contentType ? { "content-type": contentType } : {},
			});
			// Response adds a text/plain default for strings; explicitly remove it for the absent-header case.
			if (!contentType) response.headers.delete("content-type");
			const result = await fetchResponse(
				async () => response,
				true,
				undefined,
				declaration,
				[],
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
			.response(200, type(), { contentType: "application/custom" })["~restrpc"];
		expect(
			await fetchResponse(
				async () =>
					new Response("hello", {
						headers: { "content-type": "application/custom" },
					}),
				true,
				[{ match: (mediaType) => mediaType === "application/custom" }],
				declaration,
				[],
			),
		).toHaveProperty("body", expect.any(Blob));
	});

	it("propagates malformed JSON and rejects undeclared statuses with decoded bodies", async () => {
		await expect(
			decode(
				new Response("{", {
					status: 201,
					headers: { "content-type": "application/json" },
				}),
			),
		).rejects.toBeInstanceOf(SyntaxError);
		await expect(
			decode(Response.json({ message: "missing" }, { status: 404 })),
		).rejects.toMatchObject({
			status: 404,
			body: { message: "missing" },
		});
		await expect(
			decode(Response.json({}, { status: 404 })),
		).rejects.toBeInstanceOf(HttpError);
	});

	it.each(["wrong content type", "missing body"])(
		"rejects streams with %s",
		async (failure) => {
			const declaration = route.get("/").streamResponse(200, type<number>())[
				"~restrpc"
			];
			const response =
				failure === "missing body"
					? new Response(null, {
							headers: { "content-type": "text/event-stream" },
						})
					: new Response("data: 1\n\n", {
							headers: { "content-type": "application/json" },
						});
			await expect(
				fetchResponse(async () => response, false, undefined, declaration, []),
			).rejects.toThrow(
				failure === "missing body"
					? "no stream body"
					: "unsupported stream content-type",
			);
		},
	);
});
