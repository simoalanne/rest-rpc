import path from "node:path";
import ts from "typescript-compiler-api";
import { expect, test } from "vitest";

// Snapshots what an editor shows on hover for each declaration in hover.ts,
// so a public type that starts displaying an internal alias fails the test.
const file = path.join(import.meta.dirname, "hover.ts");

const createLanguageService = () => {
	const configPath = path.join(import.meta.dirname, "../tsconfig.json");
	const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
	const { options } = ts.parseJsonConfigFileContent(
		config,
		ts.sys,
		path.dirname(configPath),
	);
	return ts.createLanguageService(
		{
			getCompilationSettings: () => options,
			getScriptFileNames: () => [file],
			getScriptVersion: () => "1",
			getScriptSnapshot: (fileName) => {
				const text = ts.sys.readFile(fileName);
				return text === undefined
					? undefined
					: ts.ScriptSnapshot.fromString(text);
			},
			getCurrentDirectory: () => path.dirname(configPath),
			getDefaultLibFileName: ts.getDefaultLibFilePath,
			fileExists: ts.sys.fileExists,
			readFile: ts.sys.readFile,
			readDirectory: ts.sys.readDirectory,
			directoryExists: ts.sys.directoryExists,
			getDirectories: ts.sys.getDirectories,
		},
		ts.createDocumentRegistry(),
	);
};

test("hovering declarations shows resolved public types", async () => {
	const service = createLanguageService();
	const source = service.getProgram()?.getSourceFile(file);
	if (!source) throw new Error(`Could not load ${file}`);

	const hovers: string[] = [];
	const visit = (node: ts.Node) => {
		if (
			ts.isIdentifier(node) &&
			(ts.isVariableDeclaration(node.parent) ||
				ts.isBindingElement(node.parent) ||
				ts.isTypeAliasDeclaration(node.parent)) &&
			node.parent.name === node
		) {
			const info = service.getQuickInfoAtPosition(file, node.getStart());
			if (info) hovers.push(ts.displayPartsToString(info.displayParts));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);

	await expect(hovers.join("\n\n") + "\n").toMatchFileSnapshot(
		"__snapshots__/hover.txt",
	);
});
