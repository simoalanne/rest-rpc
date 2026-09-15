import { dirname, resolve } from "node:path";
import ts from "typescript";
import type { Contract } from "../contract/contract.ts";

type GeneratedRoute = {
	readonly "~restrpc": {
		readonly source: "generated";
		readonly kind: "http" | "procedure";
		readonly method: string;
		readonly path: string;
		readonly request?: { readonly contentType: string | readonly string[] };
		readonly responses: Readonly<Record<string, { readonly kind?: "stream" }>>;
	};
};

/** JSON-compatible contract tree produced from a checked server export. */
export type GeneratedServerContract =
	| GeneratedRoute
	| { readonly [key: string]: GeneratedServerContract };

/** Options for generating a server-backed contract artifact. */
export type generateContractFromTypeOptions = {
	/** Path to the TypeScript source file that exports the server route tree type. */
	filePath: string;
	/** Name of the exported server route tree to generate a contract from. */
	exportName: string;
	/** Path to the tsconfig.json file to use for type checking. If omitted, nearest config is used. */
	tsconfigPath?: string;
};

const formatDiagnostic = (diagnostic: ts.Diagnostic) => {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
	if (!diagnostic.file || diagnostic.start === undefined) return message;
	const position = diagnostic.file.getLineAndCharacterOfPosition(
		diagnostic.start,
	);
	return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} - ${message}`;
};

const optionalPropertyType = (
	checker: ts.TypeChecker,
	type: ts.Type,
	name: string,
	location: ts.Node,
) => {
	const property = checker.getPropertyOfType(
		checker.getNonNullableType(type),
		name,
	);
	if (!property) return undefined;
	const declaration =
		property.valueDeclaration ?? property.declarations?.[0] ?? location;
	return checker.getTypeOfSymbolAtLocation(property, declaration);
};

const propertyType = (
	checker: ts.TypeChecker,
	type: ts.Type,
	name: string,
	location: ts.Node,
) => optionalPropertyType(checker, type, name, location)!;

const stringLiteral = (type: ts.Type) => (type as ts.StringLiteralType).value;

const routeName = (path: readonly string[]) =>
	path.length > 0 ? `"${path.join(".")}"` : "at the contract root";

const literalRouteProperty = (
	checker: ts.TypeChecker,
	type: ts.Type,
	name: "method" | "path",
	location: ts.Node,
	contractPath: readonly string[],
) => {
	const value = optionalPropertyType(checker, type, name, location);
	if (!value?.isStringLiteral()) {
		throw new Error(
			`Server route ${routeName(contractPath)} must have a literal ${name}.`,
		);
	}
	return value.value;
};

const contentTypes = (
	checker: ts.TypeChecker,
	type: ts.Type,
): string | readonly string[] => {
	if (type.isStringLiteral()) return type.value;
	if (type.isUnion()) {
		const values = type.types
			.filter((entry) => (entry.flags & ts.TypeFlags.Undefined) === 0)
			.map(stringLiteral);
		return values.length === 1 ? values[0]! : values;
	}
	return checker.getTypeArguments(type as ts.TypeReference).map(stringLiteral);
};

const routeFromType = (
	checker: ts.TypeChecker,
	routeType: ts.Type,
	location: ts.Node,
	contractPath: readonly string[],
): GeneratedRoute => {
	const kind = stringLiteral(
		propertyType(checker, routeType, "kind", location),
	) as "http" | "procedure";
	const method = literalRouteProperty(
		checker,
		routeType,
		"method",
		location,
		contractPath,
	);
	const path = literalRouteProperty(
		checker,
		routeType,
		"path",
		location,
		contractPath,
	);
	const responsesType = optionalPropertyType(
		checker,
		routeType,
		"responses",
		location,
	);
	if (!responsesType) {
		throw new Error(
			`Server route ${routeName(contractPath)} must have at least one response status.`,
		);
	}
	const responseProperties = checker.getPropertiesOfType(responsesType);
	const hasWidenedStatus =
		checker.getIndexTypeOfType(responsesType, ts.IndexKind.Number) !==
			undefined ||
		checker.getIndexTypeOfType(responsesType, ts.IndexKind.String) !==
			undefined;
	const statuses = responseProperties.map((property) => property.getName());
	if (hasWidenedStatus || statuses.some((status) => !/^\d+$/.test(status))) {
		throw new Error(
			`Server route ${routeName(contractPath)} must have literal numeric response statuses.`,
		);
	}
	if (statuses.length === 0) {
		throw new Error(
			`Server route ${routeName(contractPath)} must have at least one response status.`,
		);
	}
	const responses = Object.fromEntries(
		responseProperties.map((property) => {
			const declaration =
				property.valueDeclaration ?? property.declarations?.[0] ?? location;
			const responseType = checker.getTypeOfSymbolAtLocation(
				property,
				declaration,
			);
			const responseKind = optionalPropertyType(
				checker,
				responseType,
				"kind",
				declaration,
			);
			return [
				property.getName(),
				responseKind?.isStringLiteral() && responseKind.value === "stream"
					? { kind: "stream" as const }
					: {},
			];
		}),
	);

	const requestType = optionalPropertyType(
		checker,
		routeType,
		"request",
		location,
	);
	const contentType = requestType
		? optionalPropertyType(checker, requestType, "contentType", location)
		: undefined;

	return {
		"~restrpc": {
			source: "generated",
			kind,
			method,
			path,
			...(contentType
				? { request: { contentType: contentTypes(checker, contentType) } }
				: {}),
			responses,
		},
	};
};

const contractFromType = (
	checker: ts.TypeChecker,
	type: ts.Type,
	contractPath: readonly string[] = [],
): GeneratedServerContract => {
	const routeProperty = checker.getPropertyOfType(type, "~restrpc");
	if (routeProperty) {
		const declaration =
			routeProperty.valueDeclaration ?? routeProperty.declarations![0]!;
		return routeFromType(
			checker,
			checker.getTypeOfSymbolAtLocation(routeProperty, declaration),
			declaration,
			contractPath,
		);
	}

	const entries = checker.getPropertiesOfType(type).map((property) => {
		const declaration = property.valueDeclaration ?? property.declarations![0]!;
		return [
			property.getName(),
			contractFromType(
				checker,
				checker.getTypeOfSymbolAtLocation(property, declaration),
				[...contractPath, property.getName()],
			),
		] as const;
	});
	return Object.fromEntries(entries) as GeneratedServerContract;
};

/**
 * Generates a minimal JSON-compatible contract from an exported server route tree type.
 *
 * @remarks The generation uses TypeScript compiler API to extract only the
 * minimal required information from an exported server route tree type to produce
 * a minimal JSON-compatible contract that can be used to create an API client.
 * Provide the exported route tree type as the generic argument to preserve the
 * full type information when passing the result to `initClient`.
 */
export function generateContractFromType<TContract extends Contract>(
	options: generateContractFromTypeOptions,
): TContract {
	const absoluteEntryPath = resolve(options.filePath);
	const configPath = options.tsconfigPath
		? resolve(options.tsconfigPath)
		: ts.findConfigFile(dirname(absoluteEntryPath), ts.sys.fileExists);
	if (!configPath) throw new Error("Could not find a tsconfig.json.");

	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	if (config.error) throw new Error(formatDiagnostic(config.error));
	const parsed = ts.parseJsonConfigFileContent(
		config.config,
		ts.sys,
		dirname(configPath),
	);
	const program = ts.createProgram({
		rootNames: [...new Set([...parsed.fileNames, absoluteEntryPath])],
		options: parsed.options,
	});
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length > 0) {
		throw new Error(diagnostics.map(formatDiagnostic).join("\n"));
	}

	const sourceFile = program.getSourceFile(absoluteEntryPath);
	if (!sourceFile) throw new Error(`Could not load ${absoluteEntryPath}.`);
	const checker = program.getTypeChecker();
	const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
	const exported = moduleSymbol
		? checker
				.getExportsOfModule(moduleSymbol)
				.find((symbol) => symbol.getName() === options.exportName)
		: undefined;
	if (!exported) {
		throw new Error(
			`Could not find export "${options.exportName}" in ${absoluteEntryPath}.`,
		);
	}
	const symbol =
		exported.flags & ts.SymbolFlags.Alias
			? checker.getAliasedSymbol(exported)
			: exported;
	const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
	if (!declaration) {
		throw new Error(`Export "${options.exportName}" has no declaration.`);
	}
	const type =
		symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)
			? checker.getDeclaredTypeOfSymbol(symbol)
			: checker.getTypeOfSymbolAtLocation(symbol, declaration);
	const contract = contractFromType(checker, type);
	return contract as TContract;
}
