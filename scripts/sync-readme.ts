import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// The root README.md is the source. Its table of contents is generated from
// its headings. Package READMEs are copies of it, and the docs cheatsheet page
// is the same content with frontmatter, site-relative docs links, and no table
// of contents, since the docs site renders its own.

const docsUrl = "https://rest-rpc.vercel.app/docs/";
const cheatsheetPath = "content/docs/cheatsheet.mdx";
const contentsHeading = "## Contents";

const frontmatter = `---
title: Cheatsheet
description: The whole rest-rpc API in one page, with links to each section's documentation.
---
`;

const formatPath = (root: string, filePath: string) =>
	path.relative(root, filePath).replaceAll(path.sep, "/");

const getHeadings = (markdown: string) => {
	let inCode = false;
	return markdown.split("\n").flatMap((line) => {
		if (line.startsWith("```")) inCode = !inCode;
		const match = !inCode && /^(##|###) (.+)$/.exec(line);
		if (!match || line === contentsHeading) return [];
		const text = match[2]
			.replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replaceAll("`", "");
		return [{ depth: match[1].length, text }];
	});
};

// Matches GitHub's heading anchors, including the suffix of repeated headings.
const toAnchors = (texts: readonly string[]) => {
	const seen = new Map<string, number>();
	return texts.map((text) => {
		const slug = text
			.toLowerCase()
			.replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
			.replaceAll(" ", "-");
		const count = seen.get(slug) ?? 0;
		seen.set(slug, count + 1);
		return count === 0 ? slug : `${slug}-${count}`;
	});
};

const removeContents = (markdown: string) =>
	markdown.replace(
		new RegExp(`${contentsHeading}\\n[\\s\\S]*?(?=^## )`, "m"),
		"",
	);

const withContents = (readme: string) => {
	const body = removeContents(readme);
	const headings = getHeadings(body);
	const anchors = toAnchors(headings.map(({ text }) => text));
	const items = headings.map(
		({ depth, text }, index) =>
			`${depth === 3 ? "  " : ""}- [${text}](#${anchors[index]})`,
	);
	const contents = `${contentsHeading}\n\n${items.join("\n")}\n\n`;
	const firstSection = body.search(/^## /m);
	return body.slice(0, firstSection) + contents + body.slice(firstSection);
};

const toCheatsheet = (readme: string) => {
	// The page title comes from the frontmatter, so drop the README heading.
	const body = removeContents(readme)
		.replace(/^# .*\n+/, "")
		.replaceAll(docsUrl, "/docs/");
	return `${frontmatter}\n${body}`;
};

const getTargets = (root: string, readme: string) => {
	const packagesDir = path.join(root, "packages");
	const packageReadmes = fs
		.readdirSync(packagesDir)
		.map((name) => path.join(packagesDir, name))
		.filter((packageDir) =>
			fs.existsSync(path.join(packageDir, "package.json")),
		)
		.map((packageDir) => [path.join(packageDir, "README.md"), readme] as const);

	return [
		[path.join(root, "README.md"), readme] as const,
		...packageReadmes,
		[path.join(root, cheatsheetPath), toCheatsheet(readme)] as const,
	];
};

const run = () => {
	const root = process.cwd();
	const check = process.argv.includes("--check");
	const readme = withContents(
		fs.readFileSync(path.join(root, "README.md"), "utf8"),
	);
	const outdated = getTargets(root, readme).filter(
		([filePath, content]) =>
			!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf8") !== content,
	);

	if (check) {
		if (outdated.length > 0) {
			console.error("README sync check failed. Run `pnpm run readme:sync`:\n");
			console.error(
				outdated
					.map(([filePath]) => `- ${formatPath(root, filePath)}`)
					.join("\n"),
			);
			process.exitCode = 1;
		} else {
			console.log("README sync check passed.");
		}
		return;
	}

	for (const [filePath, content] of outdated) {
		fs.writeFileSync(filePath, content);
		console.log(`Updated ${formatPath(root, filePath)}`);
	}
};

run();
