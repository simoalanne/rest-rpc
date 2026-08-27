import type { StandardSchemaV1 } from "./index.ts";

const TYPE_ONLY_SCHEMA_VENDOR = "rest-rpc";

/**
 * Creates a type-only Standard Schema for compile-time contracts.
 *
 * @remarks Runtime validation accepts the input as-is; use only when runtime validation is not needed.
 * @see {@link https://rest-rpc.dev/docs/contract/schemas#request-schema-shapes}
 */
export function type<T>(): StandardSchemaV1<T, T> {
	return {
		"~standard": {
			version: 1,
			vendor: TYPE_ONLY_SCHEMA_VENDOR,
			validate: (value) => ({ value: value as T }),
		},
	};
}
