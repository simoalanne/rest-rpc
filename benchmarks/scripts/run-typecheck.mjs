import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(root);
const generatedRoot = join(root, "generated", "contract-only");
const resultsRoot = join(root, "results", "typecheck");
const tscBin = join(repoRoot, "node_modules", ".bin", "tsc");
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const message = args.join(" ").trim();
if (!message) {
	throw new Error(
		'Missing benchmark message. Example: pnpm run run:benchmark -- "Test with all validations present"',
	);
}

const metrics = [
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

const safeSlug = (value) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);

const gitShortCommit = () => {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return undefined;
	}
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

const tableRows = [];

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
		tableRows.push({
			schema: schemaLibrary,
			routes: caseName.replace("routes-", ""),
			types: diagnostics.Types,
			instantiations: diagnostics.Instantiations,
			memory: diagnostics["Memory used"],
			check: diagnostics["Check time"],
			total: diagnostics["Total time"],
		});
	}
}

console.log("\nContract declaration typecheck benchmark\n");
console.table(tableRows);

const createdAt = new Date();
const createdAtLabel = new Intl.DateTimeFormat("en", {
	year: "numeric",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
	timeZoneName: "short",
}).format(createdAt);
const fileSlug = safeSlug(message);
const resultPath = join(resultsRoot, `${fileSlug}.md`);
const latestPath = join(resultsRoot, "latest.md");

const markdownTable = (items) => {
	const headers = [
		"schema",
		"routes",
		"types",
		"instantiations",
		"memory",
		"check",
		"total",
	];
	const header = `| ${headers.join(" | ")} |`;
	const separator = `| ${headers.map(() => "---").join(" | ")} |`;
	const body = items.map(
		(row) => `| ${headers.map((key) => row[key] ?? "").join(" | ")} |`,
	);
	return [header, separator, ...body].join("\n");
};

mkdirSync(resultsRoot, { recursive: true });
const commit = gitShortCommit();
const result = `# ${message}

Created: ${createdAtLabel}
${commit ? `Commit: ${commit}\n` : ""}

${markdownTable(tableRows)}
`;

writeFileSync(resultPath, result);
writeFileSync(latestPath, result);

console.log(`\nSaved results to ${relative(repoRoot, resultPath)}`);
console.log(
	"\nRaw fixtures live under benchmarks/generated/contract-only/ after generation.",
);
