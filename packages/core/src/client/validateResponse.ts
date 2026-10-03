import { HttpError } from "./httpError.ts";
import {
	validateStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";

export const validateResponseValue = async (
	schema: StandardSchemaV1 | undefined,
	value: unknown,
	validate: boolean,
	status: number,
) => {
	if (!validate || schema === undefined) return value;
	const result = await validateStandardSchema(schema, value);
	if (result.issues)
		throw new HttpError(status, value, { cause: result.issues });
	return result.value;
};
