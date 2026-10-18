import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript-compiler-api";

const formatPath = (root: string, filePath: string) =>
	path.relative(root, filePath).replaceAll(path.sep, "/");

const readJson = (filePath: string) =>
	JSON.parse(fs.readFileSync(filePath, "utf8"));

// Subpaths that are public API in addition to the package root. Other
// subpaths are internal.
const publicSubpaths: Record<string, readonly string[]> = {
	"@rest-rpc/server": ["./node"],
};

const getEntryPoints = (packageJson: Record<string, unknown>) => {
	const exportsField = packageJson.exports;

	if (typeof exportsField === "string") {
		return [[".", exportsField]] as const;
	}

	if (typeof exportsField !== "object" || exportsField === null) {
		return [];
	}

	const publicPaths = new Set([
		".",
		...(publicSubpaths[packageJson.name as string] ?? []),
	]);

	return Object.entries(exportsField).filter(
		(entry): entry is [string, string] =>
			publicPaths.has(entry[0]) && typeof entry[1] === "string",
	);
};

const loadPackageProgram = (packageDir: string) => {
	const configPath = path.join(packageDir, "tsconfig.json");
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

	if (configFile.error) {
		throw new Error(
			ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
		);
	}

	const parsedConfig = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		packageDir,
		undefined,
		configPath,
	);

	return ts.createProgram({
		rootNames: parsedConfig.fileNames,
		options: parsedConfig.options,
	});
};

const getLeadingCommentText = (node: ts.Node, sourceFile: ts.SourceFile) => {
	const comments = ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? [];

	return comments
		.map((comment) => sourceFile.text.slice(comment.pos, comment.end))
		.find((comment) => comment.startsWith("/**"));
};

const getNodeWithDocComment = (declaration: ts.Declaration) => {
	let node: ts.Node | undefined = declaration;

	while (node && !ts.isSourceFile(node)) {
		const sourceFile = node.getSourceFile();

		if (getLeadingCommentText(node, sourceFile)) {
			return node;
		}

		node = node.parent;
	}

	return undefined;
};

const hasDocComment = (symbol: ts.Symbol) =>
	(symbol.getDeclarations() ?? []).some((declaration) =>
		Boolean(getNodeWithDocComment(declaration)),
	);

const isRegularFunctionDeclaration = (symbol: ts.Symbol) =>
	(symbol.getDeclarations() ?? []).some(
		(declaration) =>
			ts.isFunctionDeclaration(declaration) ||
			ts.isFunctionDeclaration(declaration.parent),
	);

const hasCallableValueDeclaration = (
	checker: ts.TypeChecker,
	symbol: ts.Symbol,
) =>
	(symbol.getDeclarations() ?? []).some((declaration) => {
		const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
		return type.getCallSignatures().length > 0;
	});

const isDeclaredAsVariable = (symbol: ts.Symbol) =>
	(symbol.getDeclarations() ?? []).some(
		(declaration) =>
			ts.isVariableDeclaration(declaration) ||
			ts.isVariableDeclaration(declaration.parent),
	);

const checkWildcardExports = (
	root: string,
	sourceFile: ts.SourceFile,
	failures: string[],
) => {
	for (const statement of sourceFile.statements) {
		if (!ts.isExportDeclaration(statement)) {
			continue;
		}

		if (
			!statement.exportClause ||
			ts.isNamespaceExport(statement.exportClause)
		) {
			const position = sourceFile.getLineAndCharacterOfPosition(
				statement.getStart(sourceFile),
			);

			failures.push(
				`${formatPath(root, sourceFile.fileName)}:${position.line + 1}: entry point exports must name public symbols explicitly`,
			);
		}
	}
};

const checkEntryPoint = (
	root: string,
	packageDir: string,
	packageName: string,
	program: ts.Program,
	entryPath: string,
) => {
	const checker = program.getTypeChecker();
	const failures: string[] = [];

	if (!fs.existsSync(entryPath)) {
		failures.push(
			`${formatPath(root, entryPath)}: missing entry point source file`,
		);
		return failures;
	}

	const sourceFile = program.getSourceFile(entryPath);

	if (!sourceFile) {
		failures.push(
			`${formatPath(root, entryPath)}: not included by tsconfig.json`,
		);
		return failures;
	}

	checkWildcardExports(root, sourceFile, failures);

	const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

	if (!moduleSymbol) {
		failures.push(
			`${formatPath(root, entryPath)}: could not read module exports`,
		);
		return failures;
	}

	for (const exportSymbol of checker.getExportsOfModule(moduleSymbol)) {
		const symbol =
			exportSymbol.flags & ts.SymbolFlags.Alias
				? checker.getAliasedSymbol(exportSymbol)
				: exportSymbol;
		const name = exportSymbol.getName();

		if (!hasDocComment(symbol)) {
			failures.push(
				`${packageName}: export "${name}" must have a TSDoc comment on its declaration`,
			);
		}

		if (
			symbol.flags & ts.SymbolFlags.Value &&
			hasCallableValueDeclaration(checker, symbol) &&
			isDeclaredAsVariable(symbol) &&
			!isRegularFunctionDeclaration(symbol)
		) {
			failures.push(
				`${packageName}: export "${name}" must use a regular function declaration`,
			);
		}
	}

	return failures;
};

const checkPackage = (root: string, packageDir: string) => {
	const packageJsonPath = path.join(packageDir, "package.json");
	const packageJson = readJson(packageJsonPath);
	const entryPoints = getEntryPoints(packageJson);

	if (entryPoints.length === 0) {
		return [];
	}

	const program = loadPackageProgram(packageDir);

	return entryPoints.flatMap(([subpath, target]) =>
		checkEntryPoint(
			root,
			packageDir,
			path.posix.join(packageJson.name, subpath),
			program,
			path.join(packageDir, target),
		),
	);
};

export const checkWorkspace = (root = process.cwd()) => {
	const packagesDir = path.join(root, "packages");

	return fs
		.readdirSync(packagesDir)
		.map((name) => path.join(packagesDir, name))
		.filter((packageDir) =>
			fs.statSync(packageDir, { throwIfNoEntry: false })?.isDirectory(),
		)
		.flatMap((packageDir) => checkPackage(root, packageDir));
};

const run = () => {
	const failures = checkWorkspace();

	if (failures.length > 0) {
		console.error("Public API documentation check failed:\n");
		console.error(failures.map((failure) => `- ${failure}`).join("\n"));
		process.exitCode = 1;
	} else {
		console.log("Public API documentation check passed.");
	}
};

run();
