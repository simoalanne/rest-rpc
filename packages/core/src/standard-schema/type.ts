import type { StandardSchemaV1 } from "./index.ts";

const TYPE_ONLY_SCHEMA_VENDOR = "contract-first-api";

export const type = <T>(): StandardSchemaV1<T, T> => ({
	"~standard": {
		version: 1,
		vendor: TYPE_ONLY_SCHEMA_VENDOR,
		validate: (value) => ({ value: value as T }),
	},
});

export const isTypeOnlySchema = (schema: StandardSchemaV1) =>
	schema["~standard"].vendor === TYPE_ONLY_SCHEMA_VENDOR;

/** Returns an empty JSON Schema for schemas that cannot be represented faithfully. */
export const looseJsonSchema = (
	_schema?: StandardSchemaV1,
): Record<string, unknown> => ({});
