import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { type } from "../standard-schema/index.ts";
import { route } from "./routeFactory.ts";

describe("SSE route builder runtime", () => {
	it("builds complete SSE routes with only compatible setters", () => {
		const event = type<{ id: string }>();
		const declaration = route
			.sse("/events/:id")
			.query(z.object({ cursor: z.string() }))
			.params(type<{ id: string }>())
			.response(event);

		assert.equal(declaration.mode, "sse");
		assert.equal(declaration.responses?.[200], event);
		assert.equal(Object.hasOwn(declaration, "response"), false);
		assert.equal("body" in declaration, false);
		assert.equal("headers" in declaration, false);
	});

	it("ignores HTTP-only configured defaults", () => {
		const schema = type<string>();
		const declaration = route
			.with({
				pathPrefix: "/api",
				headers: type<{ authorization: string }>(),
				responses: { 401: schema },
				metadata: { public: true },
				strictStatusCodes: true,
			})
			.sse("/events")
			.response(schema);

		assert.equal(declaration.path, "/api/events");
		assert.equal(declaration.request?.headers, undefined);
		assert.equal(Object.hasOwn(declaration, "strictStatusCodes"), false);
		assert.deepEqual({ ...declaration.metadata }, { public: true });
	});
});
