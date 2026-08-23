import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type } from "arktype";
import * as v from "valibot";
import z from "zod";
import { resolveBuiltInRequestKeys, resolveSchemaKeys } from "./requestKeys.ts";

const sorted = (keys: readonly string[] | undefined) =>
	[...(keys ?? [])].sort();

describe("request key resolution", () => {
	it("resolves zod object keys", () => {
		assert.deepEqual(resolveBuiltInRequestKeys(z.object({ id: z.string() })), [
			"id",
		]);
	});

	it("resolves zod object-like union branch keys", () => {
		assert.deepEqual(
			sorted(
				resolveBuiltInRequestKeys(
					z.union([
						z.object({ title: z.string() }),
						z.object({ slug: z.string() }),
					]),
				),
			),
			["slug", "title"],
		);
	});

	it("resolves zod discriminated union branch keys", () => {
		assert.deepEqual(
			sorted(
				resolveBuiltInRequestKeys(
					z.discriminatedUnion("kind", [
						z.object({ kind: z.literal("article"), title: z.string() }),
						z.object({ kind: z.literal("page"), slug: z.string() }),
					]),
				),
			),
			["kind", "slug", "title"],
		);
	});

	it("does not resolve zod unions with opaque branches", () => {
		assert.equal(
			resolveBuiltInRequestKeys(
				z.union([z.object({ title: z.string() }), z.string()]),
			),
			undefined,
		);
	});

	it("resolves valibot object keys", () => {
		assert.deepEqual(resolveBuiltInRequestKeys(v.object({ id: v.string() })), [
			"id",
		]);
	});

	it("resolves valibot object-like union branch keys", () => {
		assert.deepEqual(
			sorted(
				resolveBuiltInRequestKeys(
					v.union([
						v.object({ title: v.string() }),
						v.object({ slug: v.string() }),
					]),
				),
			),
			["slug", "title"],
		);
	});

	it("resolves valibot discriminated union branch keys", () => {
		assert.deepEqual(
			sorted(
				resolveBuiltInRequestKeys(
					v.variant("kind", [
						v.object({ kind: v.literal("article"), title: v.string() }),
						v.object({ kind: v.literal("page"), slug: v.string() }),
					]),
				),
			),
			["kind", "slug", "title"],
		);
	});

	it("resolves arktype object keys", () => {
		assert.deepEqual(resolveBuiltInRequestKeys(type({ id: "string" })), ["id"]);
	});

	it("resolves arktype object-like union branch keys", () => {
		assert.deepEqual(
			sorted(
				resolveBuiltInRequestKeys(
					type({ title: "string" }).or({ slug: "string" }),
				),
			),
			["slug", "title"],
		);
	});

	it("falls back to built-in resolvers when custom resolver returns undefined", () => {
		assert.deepEqual(
			resolveSchemaKeys(z.object({ id: z.string() }), {
				resolveRequestKeys: () => undefined,
			}),
			["id"],
		);
	});

	it("uses custom resolver keys for unsupported schemas", () => {
		const schema = z.string();

		assert.deepEqual(
			resolveSchemaKeys(schema, {
				resolveRequestKeys: (candidate) =>
					candidate === schema ? ["q"] : undefined,
			}),
			["q"],
		);
	});
});
