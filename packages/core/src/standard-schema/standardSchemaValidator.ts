import type { StandardSchemaV1 } from "./standardSchema.ts";

export const validateStandardSchema = async <TSchema extends StandardSchemaV1>(
	schema: TSchema,
	value: unknown,
): Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<TSchema>>> =>
	schema["~standard"].validate(value);
