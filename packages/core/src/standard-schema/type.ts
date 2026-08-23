import type { StandardSchemaV1 } from "./index.ts";

const TYPE_ONLY_SCHEMA_VENDOR = "rest-rpc";

export function type<T>(): StandardSchemaV1<T, T> {
	return {
		"~standard": {
			version: 1,
			vendor: TYPE_ONLY_SCHEMA_VENDOR,
			validate: (value) => ({ value: value as T }),
		},
	};
}

export function isTypeOnlySchema(schema: StandardSchemaV1) {
	return schema["~standard"].vendor === TYPE_ONLY_SCHEMA_VENDOR;
}

/** Returns an empty JSON Schema for schemas that cannot be represented faithfully. */
export function looseJsonSchema(
	_schema?: StandardSchemaV1,
): Record<string, unknown> {
	return {};
}
