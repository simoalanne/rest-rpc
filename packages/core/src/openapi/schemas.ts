import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { OpenApiSchema, SchemaConverter, SchemaIo } from "./types.ts";

export const getSchemaProperties = (schema: OpenApiSchema) =>
	(schema.properties ?? {}) as Record<string, OpenApiSchema>;

export const getRequiredSchemaKeys = (schema: OpenApiSchema) =>
	new Set(Array.isArray(schema.required) ? schema.required : []);

export const convertSchema = (
	schema: StandardSchemaV1,
	io: SchemaIo,
	converter: SchemaConverter | undefined,
): OpenApiSchema => {
	if (!converter) {
		throw new Error(
			"createOpenApiDocument() requires a schemaConverter option to emit schemas from Standard Schema contracts.",
		);
	}

	return converter(schema, { io });
};
