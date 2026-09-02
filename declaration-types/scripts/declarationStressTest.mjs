import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDirectory = path.join(packageRoot, "src");
const outputDirectory = path.join(packageRoot, ".stress-dist");

export function generateLargeContract(routeCount) {
	const routes = Array.from(
		{ length: routeCount },
		(_, index) => `\troute${index}: route.get("/generated/${index}"),`,
	).join("\n");

	return `import { route } from "@rest-rpc/core";

export const largeContract = {
${routes}
};
`;
}

export function generateExtremeHttpRoute(fieldCount) {
	const fields = Array.from(
		{ length: fieldCount },
		(_, index) => `\tfield${index}: string;`,
	).join("\n");

	return `import { route, type as schemaType } from "@rest-rpc/core";

const schema = schemaType<{
${fields}
}>();

export const extremeHttpRoute = route.get("/extreme").query(schema);
`;
}

export function compileWithDeclarations(sourceName, source) {
	const sourcePath = path.join(sourceDirectory, sourceName);
	fs.writeFileSync(sourcePath, source);

	try {
		execFileSync(
			"pnpm",
			[
				"exec",
				"tsc",
				"-p",
				"tsconfig.json",
				"--noEmit",
				"false",
				"--emitDeclarationOnly",
				"--outDir",
				outputDirectory,
				"--pretty",
				"false",
			],
			{
				cwd: packageRoot,
				stdio: "pipe",
				encoding: "utf8",
			},
		);
		return { failed: false, diagnostics: "" };
	} catch (error) {
		return {
			failed: true,
			diagnostics: `${error.stdout ?? ""}${error.stderr ?? ""}`,
		};
	} finally {
		fs.rmSync(sourcePath, { force: true });
		fs.rmSync(outputDirectory, { recursive: true, force: true });
	}
}

export function findFirstFailure(makeSource, label) {
	let passing = 0;
	let failing = 1;

	while (!compileWithDeclarations(`${label}.ts`, makeSource(failing)).failed) {
		passing = failing;
		failing *= 2;
	}

	while (failing - passing > 1) {
		const candidate = Math.floor((passing + failing) / 2);
		if (compileWithDeclarations(`${label}.ts`, makeSource(candidate)).failed) {
			failing = candidate;
		} else {
			passing = candidate;
		}
	}

	const result = compileWithDeclarations(`${label}.ts`, makeSource(failing));

	return {
		passing,
		failing,
		diagnostics: result.diagnostics,
	};
}
