import type { StandardSchemaV1 } from "../standard-schema/index.ts";

type UnknownRecord = Record<string, unknown>;
type RequestKeyInfo = Record<string, boolean>;

const entriesToKeyInfo = (
	entries: readonly [string, unknown][],
	isArrayInput: (value: unknown) => boolean,
): RequestKeyInfo =>
	Object.fromEntries(entries.map(([key, value]) => [key, isArrayInput(value)]));

const mergeKeyInfo = (
	values: readonly (RequestKeyInfo | undefined)[],
): RequestKeyInfo | undefined => {
	if (values.some((value) => value === undefined)) return undefined;

	const keyInfo: RequestKeyInfo = {};
	for (const value of values) {
		for (const [key, isArray] of Object.entries(value ?? {})) {
			keyInfo[key] = keyInfo[key] || isArray;
		}
	}
	return keyInfo;
};

const isZodArrayInput = (value: unknown) => {
	const record = value as UnknownRecord;
	const innerType = (record.def as UnknownRecord | undefined)?.innerType;
	return (
		record.type === "array" ||
		(innerType as UnknownRecord | undefined)?.type === "array"
	);
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
	if (!shape || typeof shape !== "object") return undefined;
	return entriesToKeyInfo(Object.entries(shape), isZodArrayInput);
};

const resolveZodKeys = (schema: UnknownRecord): RequestKeyInfo | undefined => {
	const objectKeys = resolveZodObjectKeys(schema);
	if (objectKeys) return objectKeys;

	const options =
		(schema.def as UnknownRecord | undefined)?.options ?? schema.options;
	if (schema.type !== "union" || !Array.isArray(options)) return undefined;

	const branchKeys = options.map((option) =>
		resolveZodObjectKeys(option as UnknownRecord),
	);
	return mergeKeyInfo(branchKeys);
};

const isValibotArrayInput = (value: unknown) => {
	const record = value as UnknownRecord;
	return (
		record.type === "array" ||
		(record.wrapped as UnknownRecord | undefined)?.type === "array"
	);
};

const resolveValibotKeys = (
	schema: UnknownRecord,
): RequestKeyInfo | undefined => {
	if (schema.type === "object") {
		const entries = schema.entries;
		if (!entries || typeof entries !== "object") return undefined;
		return entriesToKeyInfo(Object.entries(entries), isValibotArrayInput);
	}
	if (
		(schema.type !== "union" && schema.type !== "variant") ||
		!Array.isArray(schema.options)
	) {
		return undefined;
	}

	const branchKeys = schema.options.map((option) =>
		(option as UnknownRecord).type === "object"
			? resolveValibotKeys(option as UnknownRecord)
			: undefined,
	);
	return mergeKeyInfo(branchKeys);
};

const isArkTypeArrayInput = (value: unknown) => {
	const record = value as UnknownRecord;
	const json = record.json as UnknownRecord | undefined;
	return json?.proto === "Array";
};

const resolveArkTypeObjectKeys = (
	schema: UnknownRecord,
): RequestKeyInfo | undefined => {
	const structure = schema.structure as UnknownRecord | undefined;
	const keys = Array.isArray(structure?.literalKeys)
		? (structure.literalKeys as readonly string[])
		: undefined;
	if (!keys) return undefined;

	const propsByKey = structure?.propsByKey as UnknownRecord | undefined;
	return Object.fromEntries(
		keys.map((key) => {
			const prop = propsByKey?.[key] as UnknownRecord | undefined;
			const inner = prop?.inner as UnknownRecord | undefined;
			return [key, isArkTypeArrayInput(inner?.value)];
		}),
	);
};

const resolveArkTypeKeys = (
	schema: UnknownRecord,
): RequestKeyInfo | undefined => {
	const objectKeys = resolveArkTypeObjectKeys(schema);
	if (objectKeys) return objectKeys;

	if (schema.kind !== "union" || !Array.isArray(schema.branches)) {
		return undefined;
	}

	const branchKeys = schema.branches.map((branch) => {
		return resolveArkTypeObjectKeys(branch as UnknownRecord);
	});
	return mergeKeyInfo(branchKeys);
};

export const resolveBuiltInRequestKeys = (
	schema: StandardSchemaV1,
): RequestKeyInfo | undefined => {
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
