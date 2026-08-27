import { readFile } from "node:fs/promises";
import path from "node:path";
import corePackage from "../packages/core/package.json" with { type: "json" };

type ChangelogEntry = {
	commit: string | null;
	packages: Set<string>;
	text: string;
};

const repoRoot = path.resolve(import.meta.dirname, "..");
const version = corePackage.version;
const repoUrl = `https://github.com/rest-rpc/rest-rpc`;

const packages = [
	["core", "packages/core/CHANGELOG.md"],
	["express", "packages/express/CHANGELOG.md"],
	["fastify", "packages/fastify/CHANGELOG.md"],
	["hono", "packages/hono/CHANGELOG.md"],
	["next", "packages/next/CHANGELOG.md"],
	["server", "packages/server/CHANGELOG.md"],
	["tanstack-query", "packages/tanstack-query/CHANGELOG.md"],
	["fetch", "packages/fetch/CHANGELOG.md"],
] as const;

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
	const commitLink = entry.commit
		? ` ([${entry.commit}](${repoUrl}/commit/${entry.commit}))`
		: "";

	bodyLines.push(`${packageList}:`);
	bodyLines.push(`- ${entry.text}${commitLink}`);
	bodyLines.push("");
}

const body = bodyLines.join("\n").trimEnd();
console.log(body);
