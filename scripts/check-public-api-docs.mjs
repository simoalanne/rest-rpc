import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import * as ts from "typescript-compiler-api";

const formatPath = (root, filePath) =>
	path.relative(root, filePath).replaceAll(path.sep, "/");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const hasRootEntryPoint = (packageJson) => {
	const exportsField = packageJson.exports;

	if (typeof exportsField === "string") {
		return true;
	}

	return (
		typeof exportsField === "object" &&
		exportsField !== null &&
		Object.hasOwn(exportsField, ".")
	);
};

const loadPackageProgram = (packageDir) => {
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

const getLeadingCommentText = (node, sourceFile) => {
	const comments = ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? [];

	return comments
		.map((comment) => sourceFile.text.slice(comment.pos, comment.end))
		.find((comment) => comment.startsWith("/**"));
};

const getNodeWithDocComment = (declaration) => {
	let node = declaration;

	while (node && !ts.isSourceFile(node)) {
		const sourceFile = node.getSourceFile();

		if (getLeadingCommentText(node, sourceFile)) {
			return node;
		}

		node = node.parent;
	}

	return undefined;
};

const hasDocComment = (symbol) =>
	(symbol.getDeclarations() ?? []).some((declaration) =>
		Boolean(getNodeWithDocComment(declaration)),
	);

const isRegularFunctionDeclaration = (symbol) =>
	(symbol.getDeclarations() ?? []).some(
		(declaration) =>
			ts.isFunctionDeclaration(declaration) ||
			ts.isFunctionDeclaration(declaration.parent),
	);

const hasCallableValueDeclaration = (checker, symbol) =>
	(symbol.getDeclarations() ?? []).some((declaration) => {
		const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
		return type.getCallSignatures().length > 0;
	});

const isDeclaredAsVariable = (symbol) =>
	(symbol.getDeclarations() ?? []).some(
		(declaration) =>
			ts.isVariableDeclaration(declaration) ||
			ts.isVariableDeclaration(declaration.parent),
	);

const checkWildcardExports = (root, sourceFile, failures) => {
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
				`${formatPath(root, sourceFile.fileName)}:${position.line + 1}: package root exports must name public symbols explicitly`,
			);
		}
	}
};

const checkPackage = (root, packageDir) => {
	const packageJsonPath = path.join(packageDir, "package.json");
	const packageJson = readJson(packageJsonPath);

	if (!hasRootEntryPoint(packageJson)) {
		return [];
	}

	const indexPath = path.join(packageDir, "src", "index.ts");
	const failures = [];

	if (!fs.existsSync(indexPath)) {
		failures.push(
			`${formatPath(root, indexPath)}: missing package root source file`,
		);
		return failures;
	}

	const program = loadPackageProgram(packageDir);
	const checker = program.getTypeChecker();
	const sourceFile = program.getSourceFile(indexPath);

	if (!sourceFile) {
		failures.push(
			`${formatPath(root, indexPath)}: not included by tsconfig.json`,
		);
		return failures;
	}

	checkWildcardExports(root, sourceFile, failures);

	const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

	if (!moduleSymbol) {
		failures.push(
			`${formatPath(root, indexPath)}: could not read module exports`,
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
				`${packageJson.name}: root export "${name}" must have a TSDoc comment on its declaration`,
			);
		}

		if (
			symbol.flags & ts.SymbolFlags.Value &&
			hasCallableValueDeclaration(checker, symbol) &&
			isDeclaredAsVariable(symbol) &&
			!isRegularFunctionDeclaration(symbol)
		) {
			failures.push(
				`${packageJson.name}: root export "${name}" must use a regular function declaration`,
			);
		}
	}

	return failures;
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	run();
}
