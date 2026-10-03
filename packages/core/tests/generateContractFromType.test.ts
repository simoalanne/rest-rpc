import { fileURLToPath } from "node:url";
import { generateContractFromType } from "@rest-rpc/core/generate";
import type {
	alias,
	EmptyResponses,
	InvalidStatus,
	MissingResponses,
	Nested,
	nested,
	root,
	UnionContent,
	WidenedMethod,
	WidenedPath,
	WidenedStatus,
} from "./fixtures/generator/contract.ts";

const fixturePath = (path: string) =>
	fileURLToPath(new URL(`./fixtures/generator/${path}`, import.meta.url));
const tsconfigPath = fixturePath("tsconfig.json");

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
		expect(generateContractFromType<typeof root>({ tsconfigPath })).toEqual(
			expected,
		);
		expect(generateContractFromType<typeof alias>({ tsconfigPath })).toEqual(
			expected,
		);
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
		expect(generateContractFromType<typeof nested>({ tsconfigPath })).toEqual(
			expected,
		);
		expect(generateContractFromType<Nested>({ tsconfigPath })).toEqual(
			expected,
		);
	}, 20000);

	it("extracts content-type unions from raw declarations", () => {
		expect(
			// @ts-expect-error raw declarations are not complete contracts
			generateContractFromType<UnionContent>({ tsconfigPath }),
		).toMatchObject({
			"~restrpc": {
				responses: {
					200: {
						contentType: expect.arrayContaining(["text/plain", "text/html"]),
					},
				},
			},
		});
	}, 20000);

	it("rejects invalid route declarations", () => {
		expect(() =>
			// @ts-expect-error raw declarations are not complete contracts
			generateContractFromType<WidenedMethod>({ tsconfigPath }),
		).toThrow("literal method");
		expect(() =>
			// @ts-expect-error raw declarations are not complete contracts
			generateContractFromType<WidenedPath>({ tsconfigPath }),
		).toThrow("literal path");
		expect(() =>
			// @ts-expect-error raw declarations are not complete contracts
			generateContractFromType<WidenedStatus>({ tsconfigPath }),
		).toThrow("literal numeric response statuses");
		expect(() =>
			// @ts-expect-error raw declarations are not complete contracts
			generateContractFromType<InvalidStatus>({ tsconfigPath }),
		).toThrow("literal numeric response statuses");
		expect(() =>
			// @ts-expect-error raw declarations are not complete contracts
			generateContractFromType<EmptyResponses>({ tsconfigPath }),
		).toThrow("at least one response status");
		expect(() =>
			// @ts-expect-error raw declarations are not complete contracts
			generateContractFromType<MissingResponses>({ tsconfigPath }),
		).toThrow("at least one response status");
	}, 20000);

	it("reads the call from an explicit file path", () => {
		expect(
			generateContractFromType({
				filePath: fixturePath("client.ts"),
				tsconfigPath,
			}),
		).toMatchObject({ "~restrpc": { method: "GET", path: "/health" } });
	}, 20000);

	it("reports a missing generic argument or call", () => {
		expect(() => generateContractFromType({ tsconfigPath })).toThrow(
			"must be called with the server route tree type as a generic argument",
		);
		expect(() =>
			generateContractFromType({
				filePath: fixturePath("contract.ts"),
				tsconfigPath,
			}),
		).toThrow("Could not find a generateContractFromType call");
	}, 20000);

	it("reports an unreadable config", () => {
		expect(() =>
			generateContractFromType<typeof root>({
				tsconfigPath: `${tsconfigPath}.missing`,
			}),
		).toThrow("Cannot read file");
	});

	it("reports when no tsconfig can be found", () => {
		expect(() =>
			generateContractFromType({
				filePath: "/missing-rest-rpc-fixture/contract.ts",
			}),
		).toThrow("Could not find a tsconfig.json");
	});
});
