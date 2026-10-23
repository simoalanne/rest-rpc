import {
	validateStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";

/** Validates a received value, unless validation is disabled or undeclared. */
export const validateResponseValue = async (
	schema: StandardSchemaV1 | undefined,
	value: unknown,
	validate: boolean,
): Promise<StandardSchemaV1.Result<unknown>> =>
	validate && schema ? validateStandardSchema(schema, value) : { value };

export const contractError = (message: string, cause?: unknown) =>
	new Error(message, cause === undefined ? undefined : { cause });

export const contractMismatch = "Response did not match the route contract.";
