import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { type } from "../standard-schema/index.ts";
import { route } from "./routeFactory.ts";

describe("HTTP route builder runtime", () => {
	it("rejects invalid HTTP response statuses", () => {
		assert.throws(
			() => route.get("/invalid").response(600 as never),
			/Invalid HTTP response status "600"/,
		);
		assert.throws(
			() =>
				route
					.with({ responses: { 99: type<string>() } } as never)
					.get("/invalid"),
			/Invalid HTTP response status "99"/,
		);
	});

	it("constructs every HTTP method and keeps methods non-enumerable", () => {
		for (const [factory, method] of [
			[route.get, "GET"],
			[route.post, "POST"],
			[route.put, "PUT"],
			[route.patch, "PATCH"],
			[route.delete, "DELETE"],
		] as const) {
			const declaration = factory("/items");
			assert.equal(declaration.method, method);
			assert.equal(declaration.path, "/items");
			assert.deepEqual(Object.keys(declaration), ["method", "path"]);
			assert.equal(Object.hasOwn(declaration, "request"), false);
			assert.equal(Object.hasOwn(declaration, "body"), false);
		}
	});

	it("supports independent setters in arbitrary order", () => {
		const schema = z.object({ value: z.string() });
		const declaration = route
			.post("/items/:id")
			.response(201, schema)
			.headers(z.object({ authorization: z.string() }))
			.body(schema)
			.query(z.object({ search: z.string() }))
			.params(type<{ id: string }>())
			.withMetadata({ scope: "write" })
			.withOpenApi({ tags: ["Items"] });
		assert.equal(declaration.request?.body, schema);
		assert.equal(declaration.responses?.[201], schema);
	});

	it("allows opaque request schemas", () => {
		const opaque = route.post("/items").body(type<{ title: string }>());
		assert.doesNotThrow(() => opaque.response(201, type<{ id: string }>()));

		const declaration = route
			.post("/items")
			.body(type<{ title: string }>())
			.response(201, type<{ id: string }>());

		assert.doesNotThrow(() => declaration.response(204));

		const responseFirst = route
			.post("/response-first")
			.response(200)
			.body(type<{ title: string }>());
		assert.doesNotThrow(() => responseFirst.response(201));
	});

	it("allows the same property names in separate request segments", () => {
		const declaration = route
			.with({ headers: z.object({ authorization: z.string() }) })
			.post("/items/:id")
			.body(z.object({ id: z.string(), context: z.string() }))
			.headers(z.object({ "x-request-id": z.string() }))
			.params(type<{ id: string }>())
			.response(201, type<{ id: string }>());
		assert.ok(declaration.request.body);
		assert.ok(declaration.request.params);
	});

	it("applies isolated defaults with local values winning", () => {
		const unauthorized = type<{ message: string }>();
		const defaults = {
			pathPrefix: "/api",
			headers: type<{ authorization: string }>(),
			responses: { 401: unauthorized },
			metadata: { auth: true, nested: { role: "user" } },
			openApi: { tags: ["Common"], responses: { 401: { description: "No" } } },

			strictStatusCodes: true,
		} as const;
		const factory = route.with(defaults);
		const first = factory
			.get("/items")
			.headers(
				z.object({ authorization: z.literal("override"), trace: z.string() }),
			)
			.response(200, type<string>())
			.customResponse(401, {
				contentType: "application/problem+json",
				schema: type<{ message: string }>(),
			})
			.withMetadata({ auth: false })
			.withOpenApi({
				tags: ["Items"],
				responses: { 401: { description: "Local" } },
			});
		const second = factory.get("/other");
		assert.equal(first.path, "/api/items");
		assert.equal(
			first.request?.headers?.inherited?.["~standard"].vendor,
			"rest-rpc",
		);
		assert.deepEqual(Object.keys(first.responses ?? {}), ["200", "401"]);
		assert.equal((first.responses[401] as { kind: string }).kind, "customBody");
		assert.equal(first.strictStatusCodes, true);
		assert.deepEqual(first.metadata, { auth: false, nested: { role: "user" } });
		assert.deepEqual(first.openApi?.tags, ["Common", "Items"]);
		assert.equal(first.openApi?.responses?.[401]?.description, "Local");
		assert.deepEqual({ ...second.metadata }, defaults.metadata);
	});

	it("builds empty response declarations", () => {
		const schema = type<string>();
		assert.equal(
			route.get("/items").response(200, schema).responses?.[200],
			schema,
		);
		assert.deepEqual(route.delete("/items").response(204).responses?.[204], {
			kind: "noBody",
		});
		assert.equal(
			route
				.with({ strictStatusCodes: true })
				.get("/items")
				.response(200, schema).strictStatusCodes,
			true,
		);
	});

	it("rejects duplicate local response statuses at runtime", () => {
		assert.throws(
			() =>
				route
					.get("/items")
					.response(200, type<string>())
					.response(200, type<number>()),
			/duplicate response status "200"/,
		);

		assert.doesNotThrow(() =>
			route
				.with({ responses: { 200: type<string>() } })
				.get("/items")
				.response(200, type<number>()),
		);
	});

	it("builds specialized request and response declarations", () => {
		const formSchema = type<{ title: string; tags: string[] }>();
		const bytes = type<Uint8Array>();
		const form = route
			.post("/forms")
			.formBody(formSchema)
			.customResponse(201, { contentType: "text/csv", schema: type<string>() });
		assert.deepEqual(form.request?.body, {
			kind: "formBody",
			schema: formSchema,
		});
		assert.equal((form.responses[201] as { kind: string }).kind, "customBody");

		const streamed = route.get("/files").customStreamResponse(200, {
			contentType: "application/octet-stream",
			schema: bytes,
		});
		assert.equal((streamed.responses[200] as { kind: string }).kind, "stream");

		const multipart = route
			.post("/uploads")
			.multipartBody(formSchema)
			.streamResponse(201, type<{ progress: number }>());
		assert.equal(
			(multipart.request!.body as { kind: string }).kind,
			"multipartBody",
		);
		assert.equal((multipart.responses[201] as { kind: string }).kind, "stream");

		const custom = route
			.post("/raw")
			.customBody(bytes)
			.jsonQuery(type<{ options: string[] }>())
			.response(204);
		assert.equal((custom.request!.body as { kind: string }).kind, "customBody");
		assert.equal((custom.request!.query as { kind: string }).kind, "jsonQuery");
	});

	it("lets specialized request setters write the expected declaration slots", () => {
		const schema = type<{ value: string }>();
		assert.equal(
			(route.post("/items").formBody(schema).request!.body as { kind: string })
				.kind,
			"formBody",
		);
		assert.equal(
			(route.get("/items").jsonQuery(schema).request!.query as { kind: string })
				.kind,
			"jsonQuery",
		);
	});

	it("does not expose with() on configured factories", () => {
		assert.equal("with" in route.with({ pathPrefix: "/api" }), false);
		assert.throws(
			() => route.with({ pathPrefix: "/:tenant" }),
			/cannot include path params/,
		);
		assert.equal(
			route.with({ pathPrefix: "/api/" }).get("/items").path,
			"/api//items",
		);
	});
});
