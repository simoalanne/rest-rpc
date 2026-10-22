import { RouteError, UNKNOWN_ERROR } from "../contract/routeError.ts";
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

const readMessage = (data: unknown) =>
	typeof data === "object" &&
	data !== null &&
	"message" in data &&
	typeof data.message === "string"
		? data.message
		: undefined;

/**
 * Creates the error for a received response the route contract does not
 * describe. The decoded body is its `data`.
 */
export const unknownError = (
	response: Response,
	data: unknown,
	fallbackMessage: string,
	cause?: unknown,
) =>
	new RouteError(UNKNOWN_ERROR, {
		status: response.status,
		message: readMessage(data) ?? fallbackMessage,
		data,
		headers: Object.fromEntries(response.headers),
		...(cause !== undefined && { cause }),
	});

export const contractMismatch = "Response did not match the route contract.";
