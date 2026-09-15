import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { type } from "../standard-schema/index.ts";
import { route } from "./routeBuilder.ts";

describe("route builder runtime", () => {
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

	it("constructs every HTTP method with only namespaced runtime data", () => {
		assert.deepEqual(route["~restrpc"], {});
		for (const [factory, method] of [
			["get", "GET"],
			["post", "POST"],
			["put", "PUT"],
			["patch", "PATCH"],
			["delete", "DELETE"],
		] as const) {
			const declaration = route[factory]("/items");
			assert.equal(declaration["~restrpc"].method, method);
			assert.equal(declaration["~restrpc"].path, "/items");
			assert.deepEqual(Object.keys(declaration), ["~restrpc"]);
			assert.deepEqual(Object.keys(declaration["~restrpc"]), [
				"kind",
				"method",
				"path",
				"responses",
				"request",
			]);
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
			.metadata({ scope: "write" })
			.openAPI({ tags: ["Items"] });
		assert.equal(declaration["~restrpc"].request?.body, schema);
		assert.equal(
			declaration["~restrpc"].request?.contentType,
			"application/json",
		);
		assert.equal(declaration["~restrpc"].responses[201].body, schema);
		assert.equal(
			declaration["~restrpc"].responses[201].contentType,
			"application/json",
		);
	});

	it("stores request and response options beside their schemas", () => {
		const bodySchema = z.string();
		const headers = z.object({ location: z.string() });
		const declaration = route
			.post("/items")
			.body(bodySchema, { contentType: "text/plain" })
			.response(201, bodySchema, { contentType: "text/plain", headers })
			.response(204, undefined, { headers });

		assert.deepEqual(declaration["~restrpc"].request, {
			body: bodySchema,
			contentType: "text/plain",
		});
		assert.deepEqual(declaration["~restrpc"].responses[201], {
			body: bodySchema,
			contentType: "text/plain",
			headers,
		});
		assert.deepEqual(declaration["~restrpc"].responses[204], {
			body: undefined,
			headers,
		});

		const procedure = route
			.input(bodySchema, { contentType: "text/plain" })
			.output(bodySchema, { contentType: "text/csv" });
		assert.deepEqual(procedure["~restrpc"].request, {
			body: bodySchema,
			contentType: "text/plain",
		});
		assert.deepEqual(procedure["~restrpc"].responses[200], {
			body: bodySchema,
			contentType: "text/csv",
		});

		const procedureStream = route.streamOutput(bodySchema);
		assert.deepEqual(procedureStream["~restrpc"].responses[200], {
			kind: "stream",
			body: bodySchema,
		});

		const stream = route.get("/events").streamResponse(200, bodySchema);
		assert.deepEqual(stream["~restrpc"].responses[200], {
			kind: "stream",
			body: bodySchema,
		});
	});

	it("normalizes common response schemas into response declarations", () => {
		const errorSchema = z.object({ message: z.string() });
		const declaration = route
			.with({ responses: { 500: errorSchema } })
			.get("/items");

		assert.deepEqual(declaration["~restrpc"].responses, {
			500: { body: errorSchema, contentType: "application/json" },
		});
	});

	it("returns a new declaration from every builder method", () => {
		const schema = type<{ value: string }>();
		const initial = route.post("/items");
		const withBody = initial.body(schema);
		const withResponse = withBody.response(201, schema);
		const metadata = withResponse.metadata({ scope: "write" });

		assert.notEqual(withBody, initial);
		assert.notEqual(withResponse, withBody);
		assert.notEqual(metadata, withResponse);
		assert.equal(initial["~restrpc"].request, undefined);
		assert.deepEqual(initial["~restrpc"].responses, {});
		assert.deepEqual(withBody["~restrpc"].responses, {});
		assert.equal(withBody["~restrpc"].request?.body, schema);
		assert.equal(withResponse["~restrpc"].metadata, undefined);
		assert.deepEqual(metadata["~restrpc"].metadata, { scope: "write" });

		const procedureInput = route.input(schema);
		const procedureOutput = procedureInput.output(schema);
		assert.notEqual(procedureOutput, procedureInput);
		assert.deepEqual(procedureInput["~restrpc"].responses, {});
		assert.equal(procedureOutput["~restrpc"].responses[200].body, schema);
	});
});
