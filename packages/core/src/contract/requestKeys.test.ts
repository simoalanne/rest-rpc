import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type } from "arktype";
import * as v from "valibot";
import z from "zod";
import { resolveBuiltInRequestKeys } from "./requestKeys.ts";

const sorted = (keys: Record<string, boolean> | undefined) =>
	Object.fromEntries(Object.entries(keys ?? {}).sort());

describe("request key resolution", () => {
	it("resolves zod object keys", () => {
		assert.deepEqual(
			resolveBuiltInRequestKeys(
				z.object({
					id: z.string(),
					tags: z.array(z.string()),
					optionalTags: z.array(z.string()).optional(),
				}),
			),
			{
				id: false,
				tags: true,
				optionalTags: true,
			},
		);
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
			{
				slug: false,
				title: false,
			},
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
			{
				kind: false,
				slug: false,
				title: false,
			},
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
		assert.deepEqual(
			resolveBuiltInRequestKeys(
				v.object({
					id: v.string(),
					tags: v.array(v.string()),
					optionalTags: v.optional(v.array(v.string())),
				}),
			),
			{
				id: false,
				tags: true,
				optionalTags: true,
			},
		);
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
			{
				slug: false,
				title: false,
			},
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
			{
				kind: false,
				slug: false,
				title: false,
			},
		);
	});

	it("resolves arktype object keys", () => {
		assert.deepEqual(
			resolveBuiltInRequestKeys(
				type({
					id: "string",
					tags: "string[]",
					"optionalTags?": "string[]",
				}),
			),
			{
				id: false,
				tags: true,
				optionalTags: true,
			},
		);
	});

	it("resolves arktype object-like union branch keys", () => {
		assert.deepEqual(
			sorted(
				resolveBuiltInRequestKeys(
					type({ title: "string" }).or({ slug: "string" }),
				),
			),
			{
				slug: false,
				title: false,
			},
		);
	});
});
