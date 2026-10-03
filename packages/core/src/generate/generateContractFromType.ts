import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Contract } from "../contract/contract.ts";

type ContentType = string | readonly string[];

type GeneratedRoute = {
	readonly "~restrpc": {
		readonly source: "generated";
		readonly kind: "http" | "procedure";
		readonly method: string;
		readonly path: string;
		readonly input?: "input" | "segments";
		readonly output?: "output" | "response";
		readonly request?: { readonly contentType: ContentType };
		readonly responses: Readonly<
			Record<
				string,
				{
					readonly kind?: "stream";
					readonly contentType?: ContentType;
					readonly headers?: Readonly<Record<string, never>>;
				}
			>
		>;
	};
};

/** JSON-compatible contract tree produced from a checked server route tree type. */
export type GeneratedServerContract =
	| GeneratedRoute
	| { readonly [key: string]: GeneratedServerContract };

/** Options for generating a server-backed contract artifact. */
export type GenerateContractFromTypeOptions = {
	/**
	 * Path to the TypeScript source file containing the `generateContractFromType`
	 * call. Defaults to the calling file. Only needed when the calling file cannot
	 * be resolved to its TypeScript source, such as compiled JavaScript without
	 * source maps.
	 */
	filePath?: string;
	/** Path to the tsconfig.json file to use for type checking. If omitted, nearest config is used. */
	tsconfigPath?: string;
};

type CallerLocation = { readonly filePath: string; readonly line?: number };

const functionName = "generateContractFromType";

const formatDiagnostic = (diagnostic: ts.Diagnostic) => {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
	if (!diagnostic.file || diagnostic.start === undefined) return message;
	const position = diagnostic.file.getLineAndCharacterOfPosition(
		diagnostic.start,
	);
	return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} - ${message}`;
};

const callerLocation = (): CallerLocation => {
	// The formatted stack is source mapped by the runtime when supported, unlike
	// raw call sites, so line numbers match the TypeScript source.
	const holder: { stack?: string } = {};
	Error.captureStackTrace(holder, generateContractFromType);
	const frame = holder.stack
		?.split("\n")
		.find((entry) => entry.trimStart().startsWith("at "))
		?.match(/\(?((?:file:\/\/)?[^\s()]+?):(\d+):\d+\)?$/);
	if (!frame) {
		throw new Error(
			`Could not resolve the file calling ${functionName}. Pass the filePath option.`,
		);
	}
	const [, fileName, line] = frame;
	return {
		filePath: fileName!.startsWith("file:")
			? fileURLToPath(fileName!)
			: fileName!,
		line: Number(line),
	};
};

const createProgram = (filePath: string, tsconfigPath: string | undefined) => {
	const configPath = tsconfigPath
		? resolve(tsconfigPath)
		: ts.findConfigFile(dirname(filePath), ts.sys.fileExists);
	if (!configPath) throw new Error("Could not find a tsconfig.json.");

	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	if (config.error) throw new Error(formatDiagnostic(config.error));
	const parsed = ts.parseJsonConfigFileContent(
		config.config,
		ts.sys,
		dirname(configPath),
	);
	const program = ts.createProgram({
		rootNames: [...new Set([...parsed.fileNames, filePath])],
		options: parsed.options,
	});
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length > 0) {
		throw new Error(diagnostics.map(formatDiagnostic).join("\n"));
	}
	return program;
};

const findGenerateCall = (
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
	line: number | undefined,
) => {
	const calls: ts.CallExpression[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isCallExpression(node)) {
			const callee = ts.isPropertyAccessExpression(node.expression)
				? node.expression.name
				: node.expression;
			const symbol = checker.getSymbolAtLocation(callee);
			const target =
				symbol && symbol.flags & ts.SymbolFlags.Alias
					? checker.getAliasedSymbol(symbol)
					: symbol;
			if (target?.getName() === functionName) calls.push(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	const lineOf = (position: number) =>
		sourceFile.getLineAndCharacterOfPosition(position).line + 1;
	const call =
		calls.length === 1
			? calls[0]
			: line === undefined
				? undefined
				: calls.find(
						(candidate) =>
							lineOf(candidate.getStart(sourceFile)) <= line &&
							line <= lineOf(candidate.end),
					);
	if (!call) {
		throw new Error(
			calls.length === 0
				? `Could not find a ${functionName} call in ${sourceFile.fileName}.`
				: `Could not determine which ${functionName} call in ${sourceFile.fileName} to generate. Use a single call per file.`,
		);
	}
	return call;
};

const propertyType = (checker: ts.TypeChecker, type: ts.Type, name: string) => {
	const property = checker.getPropertyOfType(
		checker.getNonNullableType(type),
		name,
	);
	return property ? checker.getTypeOfSymbol(property) : undefined;
};

const literalValue = (type: ts.Type | undefined) =>
	type?.isStringLiteral() ? type.value : undefined;

const routeName = (path: readonly string[]) =>
	path.length > 0 ? `"${path.join(".")}"` : "at the contract root";

const contentTypes = (
	checker: ts.TypeChecker,
	type: ts.Type | undefined,
): ContentType | undefined => {
	if (!type) return undefined;
	const nonNullable = checker.getNonNullableType(type);
	const isTuple = checker.isTupleType(nonNullable);
	const entries = nonNullable.isUnion()
		? nonNullable.types
		: isTuple
			? checker.getTypeArguments(nonNullable as ts.TypeReference)
			: [nonNullable];
	const values = entries.flatMap((entry) => literalValue(entry) ?? []);
	if (values.length === 0) return undefined;
	return values.length === 1 && !isTuple ? values[0] : values;
};

const routeFromType = (
	checker: ts.TypeChecker,
	routeType: ts.Type,
	contractPath: readonly string[],
): GeneratedRoute => {
	const fail = (requirement: string) =>
		new Error(
			`Server route ${routeName(contractPath)} must have ${requirement}.`,
		);
	const property = (name: string) => propertyType(checker, routeType, name);

	const method = literalValue(property("method"));
	if (method === undefined) throw fail("a literal method");

	const pathType = property("path");
	const path =
		(pathType?.flags ?? 0) & ts.TypeFlags.Undefined
			? `/${contractPath.join("/")}`
			: literalValue(pathType);
	if (path === undefined) throw fail("a literal path");

	const responsesType = property("responses");
	const responseProperties = responsesType
		? checker.getPropertiesOfType(responsesType)
		: [];
	if (
		responsesType &&
		(checker.getIndexInfosOfType(responsesType).length > 0 ||
			responseProperties.some((status) => !/^\d+$/.test(status.getName())))
	) {
		throw fail("literal numeric response statuses");
	}
	if (responseProperties.length === 0) {
		throw fail("at least one response status");
	}
	const responses = Object.fromEntries(
		responseProperties.map((status) => {
			const responseType = checker.getTypeOfSymbol(status);
			const response = (name: string) =>
				propertyType(checker, responseType, name);
			return [
				status.getName(),
				{
					kind:
						literalValue(response("kind")) === "stream"
							? ("stream" as const)
							: undefined,
					contentType: contentTypes(checker, response("contentType")),
					headers: response("headers") ? {} : undefined,
				},
			];
		}),
	);

	const requestType = property("request");
	const requestContentType = contentTypes(
		checker,
		requestType && propertyType(checker, requestType, "contentType"),
	);

	return {
		"~restrpc": {
			source: "generated",
			kind: literalValue(property("kind")) as "http" | "procedure",
			method,
			path,
			input: literalValue(property("input")) as "input" | "segments",
			output: literalValue(property("output")) as "output" | "response",
			request: requestContentType
				? { contentType: requestContentType }
				: undefined,
			responses,
		},
	};
};

const contractFromType = (
	checker: ts.TypeChecker,
	type: ts.Type,
	contractPath: readonly string[] = [],
): GeneratedServerContract => {
	const routeType = propertyType(checker, type, "~restrpc");
	if (routeType) return routeFromType(checker, routeType, contractPath);

	return Object.fromEntries(
		checker
			.getPropertiesOfType(type)
			.map((property) => [
				property.getName(),
				contractFromType(checker, checker.getTypeOfSymbol(property), [
					...contractPath,
					property.getName(),
				]),
			]),
	);
};

/**
 * Generates a minimal JSON-compatible contract from a server route tree type.
 *
 * @remarks The route tree type is read from the generic argument of this call.
 * The generation uses the TypeScript compiler API to locate the call in the
 * calling file and extract only the minimal required information from the
 * route tree type to produce a JSON-compatible contract that can be used to
 * create an API client. The generic argument also preserves the full type
 * information when passing the result to `initClient`.
 *
 * @example
 * ```ts
 * import type { routes } from "./server";
 *
 * export const api = generateContractFromType<typeof routes>();
 * ```
 */
export function generateContractFromType<TContract extends Contract>(
	options: GenerateContractFromTypeOptions = {},
): TContract {
	const caller: CallerLocation = options.filePath
		? { filePath: resolve(options.filePath) }
		: callerLocation();
	const program = createProgram(caller.filePath, options.tsconfigPath);
	const sourceFile = program.getSourceFile(caller.filePath);
	if (!sourceFile) throw new Error(`Could not load ${caller.filePath}.`);
	const checker = program.getTypeChecker();
	const call = findGenerateCall(checker, sourceFile, caller.line);
	const typeArgument = call.typeArguments?.[0];
	if (!typeArgument) {
		throw new Error(
			`${functionName} must be called with the server route tree type as a generic argument.`,
		);
	}
	return contractFromType(
		checker,
		checker.getTypeFromTypeNode(typeArgument),
	) as TContract;
}
