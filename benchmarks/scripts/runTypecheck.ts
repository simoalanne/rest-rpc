import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

type Row = {
	fixture: string;
	routes: number;
	types: number;
	instantiations: number;
	memoryKb: number;
	checkSeconds: number;
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedRoot = join(root, "generated");
const resultsRoot = join(root, "results");
const tscBin = join(root, "node_modules", ".bin", "tsc");

const { values } = parseArgs({
	args: process.argv.slice(2).filter((arg) => arg !== "--"),
	options: {
		label: { type: "string" },
		baseline: { type: "string" },
	},
});

const gitShortCommit = () =>
	execFileSync("git", ["rev-parse", "--short", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim();

const label = values.label ?? gitShortCommit();

const readMetric = (output: string, name: string) => {
	const match = new RegExp(`^${name}:\\s+([\\d.]+)`, "m").exec(output);
	if (!match)
		throw new Error(`Missing "${name}" in tsc diagnostics:\n${output}`);
	return Number(match[1]);
};

const runCase = (fixture: string, caseName: string): Row => {
	const tsconfig = join(generatedRoot, fixture, caseName, "tsconfig.json");
	let output: string;
	try {
		output = execFileSync(
			tscBin,
			["-p", tsconfig, "--extendedDiagnostics", "--pretty", "false"],
			{ encoding: "utf8" },
		);
	} catch (error) {
		const { stdout } = error as { stdout?: string };
		throw new Error(
			`Fixture ${fixture}/${caseName} failed to typecheck:\n${stdout}`,
		);
	}
	return {
		fixture,
		routes: Number(caseName.replace("routes-", "")),
		types: readMetric(output, "Types"),
		instantiations: readMetric(output, "Instantiations"),
		memoryKb: readMetric(output, "Memory used"),
		checkSeconds: readMetric(output, "Check time"),
	};
};

const listDirectories = (path: string) =>
	readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

const rows = listDirectories(generatedRoot)
	.sort()
	.flatMap((fixture) =>
		listDirectories(join(generatedRoot, fixture))
			.sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
			.map((caseName) => runCase(fixture, caseName)),
	);

const baseline: Row[] | undefined = values.baseline
	? JSON.parse(
			readFileSync(join(resultsRoot, `${values.baseline}.json`), "utf8"),
		)
	: undefined;

const change = (current: number, previous: number | undefined) =>
	previous === undefined || previous === 0
		? ""
		: `${current >= previous ? "+" : ""}${(((current - previous) / previous) * 100).toFixed(1)}%`;

const table = rows.map((row) => {
	const previous = baseline?.find(
		(candidate) =>
			candidate.fixture === row.fixture && candidate.routes === row.routes,
	);
	return {
		fixture: row.fixture,
		routes: row.routes,
		types: row.types,
		instantiations: row.instantiations,
		memoryKb: row.memoryKb,
		checkSeconds: row.checkSeconds,
		...(baseline && {
			"Δ types": change(row.types, previous?.types),
			"Δ instantiations": change(row.instantiations, previous?.instantiations),
			"Δ check": change(row.checkSeconds, previous?.checkSeconds),
		}),
	};
});

console.table(table);

mkdirSync(resultsRoot, { recursive: true });
const resultPath = join(resultsRoot, `${label}.json`);
writeFileSync(resultPath, `${JSON.stringify(rows, null, "\t")}\n`);
console.log(`Saved results to ${relative(process.cwd(), resultPath)}`);
