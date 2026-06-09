const execPath = process.env.npm_execpath ?? "";

if (!execPath.includes("pnpm")) {
	console.error(
		"Use pnpm publish so workspace: dependencies are rewritten before publishing.",
	);
	process.exit(1);
}
