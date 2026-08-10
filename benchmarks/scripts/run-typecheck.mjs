import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(root);
const generatedRoot = join(root, "generated", "contract-only");
const tscBin = join(repoRoot, "node_modules", ".bin", "tsc");

const metrics = [
	"Files",
	"Lines of TypeScript",
	"Identifiers",
	"Symbols",
	"Types",
	"Instantiations",
	"Memory used",
	"Check time",
	"Total time",
];

const parseDiagnostics = (output) => {
	const result = {};
	for (const line of output.split("\n")) {
		const match = /^([^:]+):\s+(.+)$/.exec(line.trim());
		if (!match) continue;
		const [, key, value] = match;
		if (metrics.includes(key)) result[key] = value;
	}
	return result;
};

if (!existsSync(generatedRoot)) {
	throw new Error(
		`Missing generated fixtures at ${generatedRoot}. Run generate:type-fixtures first.`,
	);
}

const sortRouteCases = (left, right) => {
	const leftRoutes = Number(left.replace("routes-", ""));
	const rightRoutes = Number(right.replace("routes-", ""));
	return leftRoutes - rightRoutes;
};

const schemaLibraryNames = readdirSync(generatedRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

const rows = [];

for (const schemaLibrary of schemaLibraryNames) {
	const schemaLibraryDir = join(generatedRoot, schemaLibrary);
	const cases = readdirSync(schemaLibraryDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort(sortRouteCases);

	for (const caseName of cases) {
		const caseDir = join(schemaLibraryDir, caseName);
		const tsconfig = join(caseDir, "tsconfig.json");
		const output = execFileSync(
			tscBin,
			["-p", tsconfig, "--extendedDiagnostics", "--pretty", "false"],
			{
				cwd: repoRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		const diagnostics = parseDiagnostics(output);
		rows.push({
			caseName,
			schemaLibrary,
			routes: caseName.replace("routes-", ""),
			tsconfig: relative(repoRoot, tsconfig),
			...diagnostics,
		});
	}
}

console.log("\nContract declaration typecheck benchmark\n");
console.table(
	rows.map((row) => ({
		schema: row.schemaLibrary,
		routes: row.routes,
		files: row.Files,
		lines: row["Lines of TypeScript"],
		types: row.Types,
		instantiations: row.Instantiations,
		memory: row["Memory used"],
		check: row["Check time"],
		total: row["Total time"],
	})),
);
console.log(
	"\nRaw fixtures live under benchmarks/generated/contract-only/ after generation.",
);
