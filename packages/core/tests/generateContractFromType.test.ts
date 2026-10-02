import { fileURLToPath } from "node:url";
import { generateContractFromType } from "@rest-rpc/core/generate";

const filePath = fileURLToPath(
	new URL("./fixtures/generator/contract.ts", import.meta.url),
);
const tsconfigPath = fileURLToPath(
	new URL("./fixtures/generator/tsconfig.json", import.meta.url),
);
const generate = (exportName: string) =>
	generateContractFromType({ filePath, exportName, tsconfigPath });

describe("generated contract extraction", () => {
	it("extracts root routes and aliased exports", () => {
		const expected = {
			"~restrpc": {
				source: "generated",
				kind: "http",
				method: "GET",
				path: "/health",
				output: "response",
				responses: { 204: {} },
			},
		};
		expect(generate("root")).toEqual(expected);
		expect(generate("alias")).toEqual(expected);
	}, 20000);

	it("extracts nested routes, derived paths, media arrays, headers, and streams", () => {
		const expected = {
			users: {
				create: {
					"~restrpc": {
						source: "generated",
						kind: "procedure",
						method: "POST",
						path: "/users/create",
						input: "input",
						output: "output",
						request: { contentType: "application/json" },
						responses: { 200: { contentType: "application/json" } },
					},
				},
				custom: {
					"~restrpc": {
						source: "generated",
						kind: "http",
						method: "POST",
						path: "/custom",
						input: "segments",
						output: "response",
						request: { contentType: ["text/plain", "text/html"] },
						responses: {
							201: { contentType: ["text/plain", "text/html"], headers: {} },
						},
					},
				},
				events: {
					"~restrpc": {
						source: "generated",
						kind: "http",
						method: "GET",
						path: "/events",
						output: "response",
						responses: { 200: { kind: "stream" } },
					},
				},
			},
		};
		expect(generate("nested")).toEqual(expected);
		expect(generate("Nested")).toEqual(expected);
	}, 20000);

	it("extracts content-type unions from raw declarations", () => {
		expect(generate("UnionContent")).toMatchObject({
			"~restrpc": {
				responses: {
					200: {
						contentType: expect.arrayContaining(["text/plain", "text/html"]),
					},
				},
			},
		});
	}, 20000);

	it.each([
		["WidenedMethod", "literal method"],
		["WidenedPath", "literal path"],
		["WidenedStatus", "literal numeric response statuses"],
		["InvalidStatus", "literal numeric response statuses"],
		["EmptyResponses", "at least one response status"],
		["MissingResponses", "at least one response status"],
	])(
		"rejects %s",
		(exportName, message) => {
			expect(() => generate(exportName)).toThrow(message);
		},
		20000,
	);

	it("reports a missing export and unreadable config", () => {
		expect(() => generate("missing")).toThrow(
			'Could not find export "missing"',
		);
		expect(() =>
			generateContractFromType({
				filePath,
				exportName: "root",
				tsconfigPath: `${tsconfigPath}.missing`,
			}),
		).toThrow("Cannot read file");
	}, 20000);

	it("reports when no tsconfig can be found", () => {
		expect(() =>
			generateContractFromType({
				filePath: "/missing-rest-rpc-fixture/contract.ts",
				exportName: "root",
			}),
		).toThrow("Could not find a tsconfig.json");
	});
});
