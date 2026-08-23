import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { checkWorkspace } from "./check-public-api-docs.mjs";

let workspace;

const writeFile = (filePath, contents) => {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, contents);
};

const writePackage = (name, files) => {
	const packageDir = path.join(workspace, "packages", name);

	writeFile(
		path.join(packageDir, "package.json"),
		JSON.stringify(
			{
				name: `@fixture/${name}`,
				type: "module",
				exports: {
					".": {
						types: "./dist/index.d.ts",
						import: "./dist/index.js",
					},
				},
			},
			null,
			"\t",
		),
	);

	writeFile(
		path.join(packageDir, "tsconfig.json"),
		JSON.stringify(
			{
				compilerOptions: {
					target: "ES2022",
					module: "NodeNext",
					moduleResolution: "NodeNext",
					strict: true,
					noEmit: true,
					allowImportingTsExtensions: true,
					verbatimModuleSyntax: true,
				},
				include: ["src/**/*.ts"],
			},
			null,
			"\t",
		),
	);

	for (const [filePath, contents] of Object.entries(files)) {
		writeFile(path.join(packageDir, filePath), contents);
	}
};

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), "rest-rpc-api-docs-"));
	fs.mkdirSync(path.join(workspace, "packages"));
});

afterEach(() => {
	fs.rmSync(workspace, { recursive: true, force: true });
});

test("accepts documented declarations resolved through explicit root re-exports", () => {
	writePackage("documented", {
		"src/index.ts": `
export { route } from "./route.ts";
export type { RouteOptions } from "./route.ts";
`,
		"src/route.ts": `
/**
 * Builds a route implementation.
 */
export function route() {}

/**
 * Options for building a route.
 */
export type RouteOptions = {
	signal: AbortSignal;
};
`,
	});

	assert.deepEqual(checkWorkspace(workspace), []);
});

test("fails root exports whose declarations do not have TSDoc comments", () => {
	writePackage("missing-docs", {
		"src/index.ts": `
export { route } from "./route.ts";
export type { RouteOptions } from "./route.ts";
`,
		"src/route.ts": `
export function route() {}

export type RouteOptions = {
	signal: AbortSignal;
};
`,
	});

	assert.deepEqual(checkWorkspace(workspace), [
		'@fixture/missing-docs: root export "route" must have a TSDoc comment on its declaration',
		'@fixture/missing-docs: root export "RouteOptions" must have a TSDoc comment on its declaration',
	]);
});

test("fails wildcard root exports", () => {
	writePackage("wildcard", {
		"src/index.ts": `
export * from "./route.ts";
`,
		"src/route.ts": `
/**
 * Builds a route implementation.
 */
export function route() {}
`,
	});

	assert.deepEqual(checkWorkspace(workspace), [
		"packages/wildcard/src/index.ts:2: package root exports must name public symbols explicitly",
	]);
});

test("fails callable root exports declared as variables", () => {
	writePackage("arrow-function", {
		"src/index.ts": `
export { route } from "./route.ts";
`,
		"src/route.ts": `
/**
 * Builds a route implementation.
 */
export const route = () => {};
`,
	});

	assert.deepEqual(checkWorkspace(workspace), [
		'@fixture/arrow-function: root export "route" must use a regular function declaration',
	]);
});
