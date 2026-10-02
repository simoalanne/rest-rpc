import { fileURLToPath } from "node:url";
import ts from "typescript-compiler-api";

it("emits normalized route declarations while preserving schema, context, and output types", () => {
	const fixture = fileURLToPath(
		new URL("./fixtures/normalizedRoutes.ts", import.meta.url),
	);
	const program = ts.createProgram([fixture], {
		target: ts.ScriptTarget.ES2022,
		lib: ["lib.es2022.d.ts"],
		types: ["node"],
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		skipLibCheck: true,
		allowImportingTsExtensions: true,
		declaration: true,
		emitDeclarationOnly: true,
	});
	expect(
		ts
			.getPreEmitDiagnostics(program)
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
			),
	).toEqual([]);

	let declaration = "";
	const result = program.emit(undefined, (fileName, text) => {
		if (fileName.endsWith("normalizedRoutes.d.ts")) declaration = text;
	});
	expect(result.emitSkipped).toBe(false);
	expect(declaration).toContain("export declare const getContract:");

	const source = ts.createSourceFile(
		"routes.d.ts",
		declaration,
		ts.ScriptTarget.Latest,
		true,
	);
	const statement = source.statements.find((node) =>
		ts.isVariableStatement(node),
	);
	expect(statement).toBeDefined();

	// User-owned aliases above the contract may still contain intersections.
	// The inferred library-owned shapes inside the contract must be plain objects.
	const intersections: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isIntersectionTypeNode(node))
			intersections.push(node.getText(source));
		ts.forEachChild(node, visit);
	};
	visit(statement!);
	expect(intersections).toEqual([]);
	expect(statement!.getText(source)).not.toContain("Omit<");
	expect(declaration).toContain("body: readonly [InputSchema];");
	expect(declaration).toContain("query: readonly [InputSchema];");
	expect(declaration).toContain(
		"body: readonly [InputSchema, StandardSchemaV1<",
	);
	expect(declaration).toContain("StandardSchemaV1<Output, Output>");
	expect(declaration).toContain("Context<AppContext>");
	expect(declaration).toContain("AsyncGenerator<Output, void, unknown>");
});
