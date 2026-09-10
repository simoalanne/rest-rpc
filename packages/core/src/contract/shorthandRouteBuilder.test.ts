import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type } from "../standard-schema/type.ts";
import { route } from "./routeFactory.ts";

describe("shorthand route builder runtime", () => {
	it("builds every supported input and output order", () => {
		const input = type<{ title: string }>();
		const output = type<{ id: string }>();
		const inputFirst = route.input(input).output(output);
		const outputOnly = route.output(output);
		const outputFirst = route.output(output).input(input);

		assert.equal(inputFirst.kind, "shorthand");
		assert.equal(inputFirst.input, input);
		assert.equal(inputFirst.output, output);
		assert.equal(outputOnly.kind, "shorthand");
		assert.equal(outputOnly.output, output);
		assert.equal(typeof outputOnly.input, "function");
		assert.equal(outputFirst.kind, "shorthand");
		assert.equal(outputFirst.input, input);
		assert.equal(outputFirst.output, output);
		for (const declaration of [inputFirst, outputOnly, outputFirst]) {
			assert.equal(declaration.method, "POST");
			assert.equal("path" in declaration, false);
			assert.equal(declaration.responses[200], output);
		}
		assert.deepEqual(inputFirst.request, {
			body: input,
		});
	});
});
