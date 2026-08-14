import type { StandardSchemaV1 } from "../standard-schema/index.ts";

export type ResolveRequestSchemaKeys = (
	schema: StandardSchemaV1,
) => readonly string[] | undefined;

export type RequestKeyResolverOptions = {
	resolveRequestKeys?: ResolveRequestSchemaKeys;
};

type UnknownRecord = Record<string, unknown>;

const getStringKeys = (value: unknown): readonly string[] | undefined => {
	if (!value || typeof value !== "object") return undefined;
	return Object.keys(value);
};

const resolveZodObjectKeys = (schema: UnknownRecord) => {
	if (schema.type !== "object") return undefined;

	const def = schema.def as UnknownRecord | undefined;
	const shape =
		typeof def?.shape === "object"
			? def.shape
			: typeof schema.shape === "object"
				? schema.shape
				: undefined;
	return getStringKeys(shape);
};

const resolveZodKeys = (
	schema: UnknownRecord,
): readonly string[] | undefined => {
	const objectKeys = resolveZodObjectKeys(schema);
	if (objectKeys) return objectKeys;

	const options =
		(schema.def as UnknownRecord | undefined)?.options ?? schema.options;
	if (schema.type !== "union" || !Array.isArray(options)) return undefined;

	const branchKeys = options.map((option) =>
		resolveZodObjectKeys(option as UnknownRecord),
	);
	if (branchKeys.some((keys) => keys === undefined)) return undefined;
	return [...new Set(branchKeys.flatMap((keys) => keys ?? []))];
};

const resolveValibotKeys = (
	schema: UnknownRecord,
): readonly string[] | undefined => {
	if (schema.type === "object") return getStringKeys(schema.entries);
	if (schema.type !== "union" || !Array.isArray(schema.options))
		return undefined;

	const branchKeys = schema.options.map((option) =>
		(option as UnknownRecord).type === "object"
			? getStringKeys((option as UnknownRecord).entries)
			: undefined,
	);
	if (branchKeys.some((keys) => keys === undefined)) return undefined;
	return [...new Set(branchKeys.flatMap((keys) => keys ?? []))];
};

const resolveArkTypeKeys = (
	schema: UnknownRecord,
): readonly string[] | undefined => {
	const structure = schema.structure as UnknownRecord | undefined;
	if (Array.isArray(structure?.literalKeys)) {
		return structure.literalKeys as readonly string[];
	}

	if (schema.kind !== "union" || !Array.isArray(schema.branches)) {
		return undefined;
	}

	const branchKeys = schema.branches.map((branch) => {
		const branchStructure = (branch as UnknownRecord).structure as
			| UnknownRecord
			| undefined;
		return Array.isArray(branchStructure?.literalKeys)
			? (branchStructure.literalKeys as readonly string[])
			: undefined;
	});
	if (branchKeys.some((keys) => keys === undefined)) return undefined;
	return [...new Set(branchKeys.flatMap((keys) => keys ?? []))];
};

export const resolveBuiltInRequestKeys = (
	schema: StandardSchemaV1,
): readonly string[] | undefined => {
	const schemaRecord = schema as unknown as UnknownRecord;
	switch (schema["~standard"].vendor) {
		case "zod":
			return resolveZodKeys(schemaRecord);
		case "valibot":
			return resolveValibotKeys(schemaRecord);
		case "arktype":
			return resolveArkTypeKeys(schemaRecord);
		default:
			return undefined;
	}
};

export const resolveSchemaKeys = (
	schema: StandardSchemaV1,
	options: RequestKeyResolverOptions | undefined,
) => {
	const resolved = options?.resolveRequestKeys?.(schema);

	return resolved ?? resolveBuiltInRequestKeys(schema);
};
