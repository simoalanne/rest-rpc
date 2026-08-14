import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import corePackage from "../packages/core/package.json" with { type: "json" };

type ChangelogEntry = {
	commit: string | null;
	packages: Set<string>;
	text: string;
};

type ReleasePayload = {
	body: string;
	draft: boolean;
	name: string;
	prerelease: boolean;
	tag_name: string;
	target_commitish: string;
};

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const version = corePackage.version;
const tagName = `v${version}`;
const repoUrl = `https://github.com/rest-rpc/rest-rpc`;

const packages = [
	["core", "packages/core/CHANGELOG.md"],
	["express", "packages/express/CHANGELOG.md"],
	["fastify", "packages/fastify/CHANGELOG.md"],
	["hono", "packages/hono/CHANGELOG.md"],
	["next", "packages/next/CHANGELOG.md"],
	["server", "packages/server/CHANGELOG.md"],
	["tanstack-query", "packages/tanstack-query/CHANGELOG.md"],
	["web", "packages/web/CHANGELOG.md"],
] as const;

if (!process.argv.includes("--dry-run")) {
	throw new Error("Only dry-run mode is implemented right now.");
}

const targetCommitish =
	process.env.GITHUB_SHA ??
	(
		await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
	).stdout.trim();

const changelogs = await Promise.all(
	packages.map(async ([displayName, changelogPath]) => ({
		displayName,
		text: await readFile(path.join(repoRoot, changelogPath), "utf8"),
	})),
);
const groupedEntries = new Map<string, ChangelogEntry>();

for (const { displayName, text } of changelogs) {
	const lines = text.split(/\r?\n/);
	const startIndex = lines.findIndex((line) => line.trim() === `## ${version}`);
	const endIndex = lines.findIndex(
		(line, index) => index > startIndex && line.startsWith("## "),
	);
	const versionLines =
		startIndex === -1
			? []
			: lines.slice(startIndex + 1, endIndex === -1 ? undefined : endIndex);

	for (let index = 0; index < versionLines.length; index += 1) {
		const line = versionLines[index];

		if (!line.startsWith("- ")) {
			continue;
		}

		const firstLine = line.slice(2).trim();
		const commitMatch = /^(?<commit>[0-9a-f]{7,40}):\s*(?<text>.+)$/iu.exec(
			firstLine,
		);
		const commit = commitMatch?.groups?.commit ?? null;
		const entryText = (commitMatch?.groups?.text ?? firstLine)
			.replace(/\s+/gu, " ")
			.trim();
		const key = JSON.stringify({ commit, text: entryText });
		const existingEntry = groupedEntries.get(key);

		if (existingEntry) {
			existingEntry.packages.add(displayName);
			continue;
		}

		groupedEntries.set(key, {
			commit,
			packages: new Set([displayName]),
			text: entryText,
		});
	}
}

const entries = [...groupedEntries.values()].sort((left, right) => {
	const leftPackages = [...left.packages].join(", ");
	const rightPackages = [...right.packages].join(", ");
	return (
		leftPackages.localeCompare(rightPackages) ||
		left.text.localeCompare(right.text)
	);
});
const bodyLines: string[] = [];

if (entries.length === 0) {
	throw new Error(`No changelog entries found for ${version}.`);
}

for (const entry of entries) {
	const packageList = [...entry.packages].sort().join(", ");
	const commitLink = ` ([${entry.commit}](${repoUrl}/commit/${entry.commit}))`;

	bodyLines.push(`${packageList}:`);
	bodyLines.push(`- ${entry.text}${commitLink}`);
	bodyLines.push("");
}

const body = bodyLines.join("\n").trimEnd();
const payload: ReleasePayload = {
	body,
	draft: false,
	name: tagName,
	prerelease: version.includes("-"),
	tag_name: tagName,
	target_commitish: targetCommitish,
};

console.log("GitHub release dry run");
console.log("");
console.log("Tag that would be created:");
console.log(tagName);
console.log("");
console.log("Release payload that would be sent:");
console.log(JSON.stringify(payload, null, 2));
console.log("");
console.log("Rendered release body:");
console.log(body);
