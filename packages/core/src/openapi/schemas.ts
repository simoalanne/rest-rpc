import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";
import type { OpenApiSchema, SchemaConverter, SchemaIo } from "./types.ts";

export const getSchemaProperties = (schema: OpenApiSchema) =>
	(schema.properties ?? {}) as Record<string, OpenApiSchema>;

export const getRequiredSchemaKeys = (schema: OpenApiSchema) =>
	new Set(Array.isArray(schema.required) ? schema.required : []);

export const isSchemaOptional = (schema: StandardSchemaV1) =>
	!validateStandardSchemaSync(schema, undefined).issues;

export const convertSchema = (
	schema: StandardSchemaV1,
	io: SchemaIo,
	converter: SchemaConverter,
): OpenApiSchema => converter(schema, { io });
