import type { SchemaConverter } from "../openapi/operation.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";

type UppercaseKeys<T> = T extends object
	? string extends keyof T
		? never // Records like `z.record()` have no names to check.
		: Exclude<keyof T & string, Lowercase<keyof T & string>>
	: never;

// Received header names are lowercase, so a name with uppercase letters never
// matches. Schemas are checked by their input, the record a side validates.
type UppercaseHeaderNames<THeaders> = THeaders extends StandardSchemaV1
	? UppercaseKeys<StandardSchemaV1.InferInput<THeaders>>
	: UppercaseKeys<THeaders>;

/** Rejects a header schema or record with header names that have uppercase letters. */
export type LowercaseHeadersCheck<THeaders> = [
	UppercaseHeaderNames<THeaders>,
] extends [never]
	? unknown
	: {
			"~error": `Header names must be lowercase: ${UppercaseHeaderNames<THeaders>}`;
		};

/** Rejects options whose `headers` have header names with uppercase letters. */
export type LowercaseHeadersOptionCheck<TOptions> = TOptions extends {
	headers: infer THeaders;
}
	? { headers: LowercaseHeadersCheck<THeaders> }
	: unknown;

// A body's content type is its `content-type` header. A `const` or `enum`
// lists it, a header without a readable value allows any, and without one a
// response body is JSON, and a request body JSON or multipart, as the server
// accepts.
export const contentTypesOf = (
	headers: readonly StandardSchemaV1[],
	converter: SchemaConverter | undefined,
	mode: "input" | "output",
): readonly string[] => {
	for (const schema of headers) {
		const properties = converter?.(schema, mode)?.properties;
		const header =
			typeof properties === "object" && properties !== null
				? (properties as Record<string, Record<string, unknown> | undefined>)[
						"content-type"
					]
				: undefined;
		if (!header) continue;
		if (typeof header.const === "string") return [header.const];
		if (Array.isArray(header.enum)) return header.enum.map(String);
		return ["*/*"];
	}
	return mode === "input"
		? ["application/json", "multipart/form-data"]
		: ["application/json"];
};
