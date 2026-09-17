import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "@rest-rpc/core";
import z from "zod";
import { assertRequestContentType } from "./requestContentType.ts";

describe("assertRequestContentType", () => {
	it("accepts normalized declared members but does not broaden JSON acceptance", () => {
		const declaration = route.post("/body").body(z.unknown(), {
			contentType: ["application/json", "text/plain"],
		})["~restrpc"];
		assert.equal(
			assertRequestContentType(declaration, "Text/Plain; charset=utf-8"),
			undefined,
		);
		assert.deepEqual(
			assertRequestContentType(declaration, "application/problem+json"),
			{
				status: 415,
				message: "Unsupported request body content type.",
			},
		);
	});

	it("accepts missing headers and rejects received types without a declaration", () => {
		const declaration = route.post("/body").body(z.unknown())["~restrpc"];
		for (const header of [undefined, null, "", " "]) {
			assert.equal(assertRequestContentType(declaration, header), undefined);
			assert.equal(
				assertRequestContentType(route.get("/empty")["~restrpc"], header),
				undefined,
			);
		}
		assert.deepEqual(
			assertRequestContentType(
				route.get("/empty")["~restrpc"],
				"application/xml",
			),
			{ status: 415, message: "Unsupported request body content type." },
		);
		assert.equal(
			assertRequestContentType(declaration, "application/json; charset=utf-8"),
			undefined,
		);
		assert.equal(
			assertRequestContentType(declaration, "text/plain")?.status,
			415,
		);
	});
});
