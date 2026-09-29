import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { type } from "../standard-schema/index.ts";
import { RouteBuilder, route } from "./routeBuilder.ts";

describe("route builder runtime", () => {
	it("rejects invalid HTTP response statuses", () => {
		const runtimeRoute = route as unknown as RouteBuilder;
		assert.throws(
			() => route.get("/invalid").response(600 as never),
			/Invalid HTTP response status "600"/,
		);
		assert.throws(
			() => runtimeRoute.response(99, type<string>()),
			/Invalid HTTP response status "99"/,
		);
	});

	it("constructs every HTTP method with only namespaced runtime data", () => {
		assert.deepEqual(route["~restrpc"], { path: undefined });
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
				"path",
				"kind",
				"method",
				"responses",
				"request",
			]);
			assert.equal(Object.hasOwn(declaration, "request"), false);
			assert.equal(Object.hasOwn(declaration, "body"), false);
		}
	});

	it("selects an HTTP method without an explicit path", () => {
		for (const [factory, method] of [
			["get", "GET"],
			["post", "POST"],
			["put", "PUT"],
			["patch", "PATCH"],
			["delete", "DELETE"],
		] as const) {
			const declaration = route[factory]();
			assert.equal(declaration["~restrpc"].kind, "http");
			assert.equal(declaration["~restrpc"].method, method);
			assert.equal(declaration["~restrpc"].path, undefined);
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
		assert.deepEqual(declaration["~restrpc"].request?.body, [schema]);
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

	it("selects the HTTP method before or after request declarations", () => {
		const query = z.object({ search: z.string() });
		const methodFirst = route.get("/items").query(query);
		const methodLast = route.query(query).get("/items");

		assert.deepEqual(methodLast["~restrpc"], methodFirst["~restrpc"]);
	});

	it("materializes flat input for the selected HTTP method", () => {
		const schema = z.object({ search: z.string() });

		assert.deepEqual(
			route.input(schema, { contentType: "text/plain" }).get("/items")[
				"~restrpc"
			].request,
			{ query: [schema] },
		);
		assert.deepEqual(
			route.get("/items").input(schema, { contentType: "text/plain" })[
				"~restrpc"
			].request,
			{ query: [schema] },
		);
		assert.deepEqual(route.input(schema).post("/items")["~restrpc"].request, {
			body: [schema],
			contentType: "application/json",
		});
	});

	it("stores repeated request schemas in declaration order", () => {
		const first = z.object({ first: z.string() });
		const second = z.object({ second: z.string() });
		const headers = z.object({ authorization: z.string() });
		const declaration = route
			.post("/items")
			.body(first, { contentType: "text/plain" })
			.body(second, { contentType: "application/json" })
			.headers(headers)
			.headers(headers);

		assert.deepEqual(declaration["~restrpc"].request, {
			body: [first, second],
			contentType: "text/plain",
			headers: [headers, headers],
		});
	});

	it("combines flat input with stacked headers in either order", () => {
		const input = z.object({ title: z.string() });
		const details = z.object({ description: z.string().optional() });
		const authorization = z.object({ authorization: z.string() });
		const requestId = z.object({ "x-request-id": z.string() });

		const declaration = route
			.headers(authorization)
			.input(input)
			.headers(requestId)
			.input(details)
			.post("/items");

		assert.equal(declaration["~restrpc"].input, "input");
		assert.deepEqual(declaration["~restrpc"].request, {
			body: [input, details],
			contentType: "application/json",
			headers: [authorization, requestId],
		});
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
			body: [bodySchema],
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
			body: [bodySchema],
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

	it("rejects conflicting input and output choices", () => {
		const runtimeRoute = route as unknown as RouteBuilder;
		const schema = type<{ id: string }>();
		assert.throws(
			() => runtimeRoute.input(schema).body(schema),
			/Cannot combine flat input with request segments/,
		);
		assert.throws(
			() => runtimeRoute.body(schema).input(schema),
			/Cannot combine flat input with request segments/,
		);
		assert.throws(
			() => runtimeRoute.output(schema).response(201, schema),
			/Cannot combine plain output with response envelopes/,
		);
		assert.throws(
			() => runtimeRoute.response(201, schema).output(schema),
			/Cannot combine plain output with response envelopes/,
		);
		assert.throws(
			() => runtimeRoute.get("/items").body(schema),
			/GET routes cannot declare a request body/,
		);
		assert.throws(
			() => runtimeRoute.get("/items/:id").input(schema),
			/Flat input requires a static route path/,
		);
		assert.throws(
			() => runtimeRoute.body(schema).get("/items"),
			/GET routes cannot declare a request body/,
		);
		assert.throws(
			() => runtimeRoute.input(schema).get("/items/:id"),
			/Flat input requires a static route path/,
		);
		assert.throws(
			() => runtimeRoute.response(201, schema).response(201, schema),
			/Response status "201" has already been declared/,
		);
		assert.throws(
			() => runtimeRoute.query(schema).get("/items").post("/items"),
			/Route method and path have already been selected/,
		);
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
		assert.deepEqual(withBody["~restrpc"].request?.body, [schema]);
		assert.equal(withResponse["~restrpc"].metadata, undefined);
		assert.deepEqual(metadata["~restrpc"].metadata, { scope: "write" });

		const procedureInput = route.input(schema);
		const procedureOutput = procedureInput.output(schema);
		assert.notEqual(procedureOutput, procedureInput);
		assert.deepEqual(procedureInput["~restrpc"].responses, {});
		assert.equal(procedureOutput["~restrpc"].responses[200].body, schema);
	});
});
